import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { StrategyKind } from "./strategies/types";

export const runBacktest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      limit: z.number().int().min(50).max(500).default(300),
      fee_bps: z.number().min(0).max(100).default(10), // 0.10% per trade
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: bot, error } = await context.supabase
      .from("bots")
      .select("symbol, timeframe, strategy, params, exchange_accounts(exchange, mode, api_key_enc, api_secret_enc, passphrase_enc)")
      .eq("id", data.id)
      .single();
    if (error || !bot) throw new Error(error?.message ?? "Bot not found");
    const acct = Array.isArray(bot.exchange_accounts) ? bot.exchange_accounts[0] : bot.exchange_accounts;
    if (!acct) throw new Error("Account missing");

    const { decryptSecret } = await import("./crypto.server");
    const { createAdapter } = await import("./exchanges/adapters.server");
    const { evaluate } = await import("./strategies/engine.server");

    const adapter = createAdapter(acct.exchange as never, acct.mode as never, {
      apiKey: decryptSecret(acct.api_key_enc),
      apiSecret: decryptSecret(acct.api_secret_enc),
      passphrase: acct.passphrase_enc ? decryptSecret(acct.passphrase_enc) : undefined,
    });

    let candles;
    try {
      candles = await adapter.getCandles(bot.symbol, bot.timeframe, data.limit);
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "candles failed" };
    }
    if (candles.length < 30) return { ok: false as const, error: "Not enough candles" };

    const feeRate = data.fee_bps / 10_000;
    let position = 0;
    let costBasis = 0;
    let realized = 0;
    let wins = 0, losses = 0;
    let lastBuyTs: number | null = null;
    const equity: Array<{ time: number; value: number }> = [];
    const trades: Array<{ time: number; side: "buy" | "sell"; qty: number; price: number; pnl: number }> = [];

    // Walk forward; feed engine an expanding window so indicators warm up.
    const minWindow = 30;
    for (let i = minWindow; i < candles.length; i++) {
      const window = candles.slice(0, i + 1);
      const price = window[window.length - 1].close;
      const ts = window[window.length - 1].time;
      const decision = evaluate(bot.strategy as StrategyKind, {
        candles: window, position, lastBuyTs,
        params: bot.params as Record<string, number | string>,
      });
      if (decision.signal === "buy" && decision.qty > 0) {
        const cost = price * decision.qty * (1 + feeRate);
        const newPos = position + decision.qty;
        costBasis = newPos > 0 ? (costBasis * position + cost) / newPos : 0;
        position = newPos;
        lastBuyTs = ts;
        trades.push({ time: ts, side: "buy", qty: decision.qty, price, pnl: 0 });
      } else if (decision.signal === "sell" && decision.qty > 0 && position > 0) {
        const qty = Math.min(decision.qty, position);
        const proceeds = price * qty * (1 - feeRate);
        const pnl = proceeds - costBasis * qty;
        realized += pnl;
        if (pnl > 0) wins++; else if (pnl < 0) losses++;
        position -= qty;
        if (position <= 0) { position = 0; costBasis = 0; }
        trades.push({ time: ts, side: "sell", qty, price, pnl });
      }
      const unreal = position > 0 ? (price - costBasis) * position : 0;
      equity.push({ time: ts, value: realized + unreal });
    }

    // Drawdown
    let peak = -Infinity;
    let maxDD = 0;
    for (const p of equity) {
      if (p.value > peak) peak = p.value;
      const dd = peak - p.value;
      if (dd > maxDD) maxDD = dd;
    }

    const totalClosed = wins + losses;
    const lastPrice = candles[candles.length - 1].close;
    const unrealized = position > 0 ? (lastPrice - costBasis) * position : 0;

    return {
      ok: true as const,
      candles_used: candles.length,
      from: candles[0].time,
      to: candles[candles.length - 1].time,
      realized,
      unrealized,
      total: realized + unrealized,
      trades_count: trades.length,
      wins, losses,
      win_rate: totalClosed > 0 ? wins / totalClosed : 0,
      max_drawdown: maxDD,
      equity,
      trades: trades.slice(-100),
    };
  });