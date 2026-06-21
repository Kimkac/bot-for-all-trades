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