import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { STRATEGIES, validateParams, type StrategyKind } from "./strategies/types";

const STRATEGY_KEYS = Object.keys(STRATEGIES) as [StrategyKind, ...StrategyKind[]];

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  account_id: z.string().uuid(),
  name: z.string().trim().min(1).max(64),
  symbol: z.string().trim().min(1).max(32).transform((s) => s.toUpperCase()),
  timeframe: z.string().trim().min(1).max(8),
  strategy: z.enum(STRATEGY_KEYS),
  params: z.record(z.string(), z.unknown()).default({}),
  max_position: z.number().nonnegative().default(0),
  max_daily_loss: z.number().nonnegative().default(0),
});

export const listBots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("bots")
      .select(
        "id, name, symbol, timeframe, strategy, params, status, last_error, last_tick_at, started_at, account_id, max_position, max_daily_loss, created_at, exchange_accounts(label, exchange, mode)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("bots")
      .select("*, exchange_accounts(label, exchange, mode)")
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error(error?.message ?? "Bot not found");
    return row;
  });

export const upsertBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const params = validateParams(data.strategy as StrategyKind, data.params);

    // Verify the account belongs to the caller (RLS does this too, but fail fast).
    const { data: acct, error: acctErr } = await context.supabase
      .from("exchange_accounts")
      .select("id")
      .eq("id", data.account_id)
      .maybeSingle();
    if (acctErr) throw new Error(acctErr.message);
    if (!acct) throw new Error("Exchange account not found");

    const row = {
      user_id: context.userId,
      account_id: data.account_id,
      name: data.name,
      symbol: data.symbol,
      timeframe: data.timeframe,
      strategy: data.strategy,
      params,
      max_position: data.max_position,
      max_daily_loss: data.max_daily_loss,
    };

    if (data.id) {
      const { error } = await context.supabase.from("bots").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase.from("bots").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const setBotStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), running: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch = data.running
      ? { status: "running" as const, started_at: new Date().toISOString(), last_error: null }
      : { status: "stopped" as const };
    const { error } = await context.supabase.from("bots").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("bots").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getBotActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [signals, trades, equity] = await Promise.all([
      context.supabase
        .from("signals")
        .select("id, kind, price, reason, ts")
        .eq("bot_id", data.id)
        .order("ts", { ascending: false })
        .limit(50),
      context.supabase
        .from("trades")
        .select("id, side, qty, price, status, ts, order_id")
        .eq("bot_id", data.id)
        .order("ts", { ascending: false })
        .limit(50),
      context.supabase
        .from("equity_snapshots")
        .select("equity, pnl, ts")
        .eq("bot_id", data.id)
        .order("ts", { ascending: true })
        .limit(500),
    ]);
    if (signals.error) throw new Error(signals.error.message);
    if (trades.error) throw new Error(trades.error.message);
    if (equity.error) throw new Error(equity.error.message);

    // Compute per-bot stats from filled trades (chronological).
    const filled = (trades.data ?? [])
      .filter((t) => t.status === "filled")
      .slice()
      .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    let position = 0;
    let costBasis = 0;
    let realized = 0;
    let wins = 0;
    let losses = 0;
    let lastPrice = 0;
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    let dailyRealized = 0;
    let tradesToday = 0;
    for (const t of filled) {
      const qty = Number(t.qty);
      const price = Number(t.price);
      lastPrice = price;
      const isToday = new Date(t.ts) >= startOfDay;
      if (isToday) tradesToday += 1;
      if (t.side === "buy") {
        const newPos = position + qty;
        costBasis = newPos > 0 ? (costBasis * position + price * qty) / newPos : 0;
        position = newPos;
      } else {
        const closeQty = Math.min(qty, position);
        const pnl = (price - costBasis) * closeQty;
        realized += pnl;
        if (isToday) dailyRealized += pnl;
        if (pnl > 0) wins += 1; else if (pnl < 0) losses += 1;
        position -= closeQty;
        if (position <= 0) { position = 0; costBasis = 0; }
      }
    }
    const unrealized = position > 0 && lastPrice > 0 ? (lastPrice - costBasis) * position : 0;
    const totalClosed = wins + losses;
    const stats = {
      realized,
      unrealized,
      total: realized + unrealized,
      position,
      cost_basis: costBasis,
      last_price: lastPrice,
      wins, losses,
      win_rate: totalClosed > 0 ? wins / totalClosed : 0,
      trades_count: filled.length,
      trades_today: tradesToday,
      daily_realized: dailyRealized,
      daily_loss: Math.max(0, -dailyRealized),
    };

    return {
      signals: signals.data ?? [],
      trades: trades.data ?? [],
      equity: equity.data ?? [],
      stats,
    };
  });

export const runBotTickNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Verify ownership through RLS-safe read first.
    const { data: own, error } = await context.supabase
      .from("bots").select("id").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!own) throw new Error("Bot not found");
    const { runOneBot } = await import("./bot-tick.server");
    const r = await runOneBot(data.id);
    return r;
  });

export const getCandles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), limit: z.number().int().min(10).max(500).default(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: bot, error } = await context.supabase
      .from("bots")
      .select("symbol, timeframe, exchange_accounts(exchange, mode, api_key_enc, api_secret_enc, passphrase_enc)")
      .eq("id", data.id)
      .single();
    if (error || !bot) throw new Error(error?.message ?? "Bot not found");
    const acct = Array.isArray(bot.exchange_accounts) ? bot.exchange_accounts[0] : bot.exchange_accounts;
    if (!acct) throw new Error("Account missing");
    const { decryptSecret } = await import("./crypto.server");
    const { createAdapter } = await import("./exchanges/adapters.server");
    const adapter = createAdapter(acct.exchange as never, acct.mode as never, {
      apiKey: decryptSecret(acct.api_key_enc),
      apiSecret: decryptSecret(acct.api_secret_enc),
      passphrase: acct.passphrase_enc ? decryptSecret(acct.passphrase_enc) : undefined,
    });
    try {
      const candles = await adapter.getCandles(bot.symbol, bot.timeframe, data.limit);
      return { ok: true as const, candles };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "candles failed" };
    }
  });