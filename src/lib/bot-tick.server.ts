import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptSecret } from "@/lib/crypto.server";
import { createAdapter } from "@/lib/exchanges/adapters.server";
import type { ExchangeKind, ExchangeMode } from "@/lib/exchanges/types";
import { evaluate } from "@/lib/strategies/engine.server";
import type { StrategyKind } from "@/lib/strategies/types";

interface BotRow {
  id: string;
  user_id: string;
  symbol: string;
  timeframe: string;
  strategy: string;
  params: Record<string, number | string>;
  max_position: number;
  max_daily_loss: number;
  exchange_accounts: {
    exchange: string;
    mode: string;
    api_key_enc: string;
    api_secret_enc: string;
    passphrase_enc: string | null;
  } | null;
}

async function getPositionAndLastBuy(botId: string) {
  const { data: trades } = await supabaseAdmin
    .from("trades")
    .select("side, qty, ts")
    .eq("bot_id", botId)
    .eq("status", "filled")
    .order("ts", { ascending: true });
  let pos = 0;
  let lastBuyTs: number | null = null;
  for (const t of trades ?? []) {
    const q = Number(t.qty);
    if (t.side === "buy") { pos += q; lastBuyTs = Math.floor(new Date(t.ts).getTime() / 1000); }
    else pos -= q;
  }
  return { position: pos, lastBuyTs };
}

export async function runOneBot(botId: string): Promise<{ ok: true; signal: string; reason: string } | { ok: false; error: string }> {
  const { data: bot, error } = await supabaseAdmin
    .from("bots")
    .select("id, user_id, symbol, timeframe, strategy, params, max_position, max_daily_loss, exchange_accounts(exchange, mode, api_key_enc, api_secret_enc, passphrase_enc)")
    .eq("id", botId)
    .single<BotRow>();

  if (error || !bot) return { ok: false, error: error?.message ?? "Bot not found" };
  const acct = bot.exchange_accounts;
  if (!acct) return { ok: false, error: "Exchange account missing" };

  try {
    const adapter = createAdapter(acct.exchange as ExchangeKind, acct.mode as ExchangeMode, {
      apiKey: decryptSecret(acct.api_key_enc),
      apiSecret: decryptSecret(acct.api_secret_enc),
      passphrase: acct.passphrase_enc ? decryptSecret(acct.passphrase_enc) : undefined,
    });

    const candles = await adapter.getCandles(bot.symbol, bot.timeframe, 200);
    const { position, lastBuyTs } = await getPositionAndLastBuy(bot.id);

    const decision = evaluate(bot.strategy as StrategyKind, {
      candles, position, lastBuyTs, params: bot.params,
    });

    // Persist signal
    await supabaseAdmin.from("signals").insert({
      bot_id: bot.id, user_id: bot.user_id,
      kind: decision.signal, price: decision.price, reason: decision.reason,
    });

    if (decision.signal !== "hold" && decision.qty > 0) {
      // Risk: cap absolute position
      let qty = decision.qty;
      if (decision.signal === "buy" && bot.max_position > 0) {
        const room = Math.max(0, bot.max_position - position);
        qty = Math.min(qty, room);
      }
      if (qty > 0) {
        try {
          const fill = await adapter.placeMarketOrder(bot.symbol, decision.signal, qty);
          await supabaseAdmin.from("trades").insert({
            bot_id: bot.id, user_id: bot.user_id,
            side: decision.signal, qty: fill.filledQty, price: fill.avgPrice || decision.price,
            order_id: fill.orderId, status: "filled", raw: fill.raw as object,
          });
        } catch (e) {
          await supabaseAdmin.from("trades").insert({
            bot_id: bot.id, user_id: bot.user_id,
            side: decision.signal, qty, price: decision.price,
            status: "rejected", raw: { error: e instanceof Error ? e.message : String(e) },
          });
          throw e;
        }
      }
    }

    // Equity snapshot (mark-to-market on last price)
    const newPos = decision.signal === "buy" ? position + decision.qty
      : decision.signal === "sell" ? position - decision.qty : position;
    await supabaseAdmin.from("equity_snapshots").insert({
      bot_id: bot.id, user_id: bot.user_id,
      equity: newPos * decision.price, pnl: 0,
    });

    await supabaseAdmin.from("bots").update({
      last_tick_at: new Date().toISOString(), last_error: null,
    }).eq("id", bot.id);

    return { ok: true, signal: decision.signal, reason: decision.reason };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Tick failed";
    await supabaseAdmin.from("bots").update({
      last_tick_at: new Date().toISOString(), last_error: msg,
    }).eq("id", bot.id);
    return { ok: false, error: msg };
  }
}

export async function runAllRunningBots() {
  const { data: bots, error } = await supabaseAdmin
    .from("bots").select("id").eq("status", "running");
  if (error) throw new Error(error.message);
  const results: Array<{ id: string; ok: boolean; detail: string }> = [];
  for (const b of bots ?? []) {
    const r = await runOneBot(b.id);
    results.push({ id: b.id, ok: r.ok, detail: r.ok ? `${r.signal}: ${r.reason}` : r.error });
  }
  return results;
}