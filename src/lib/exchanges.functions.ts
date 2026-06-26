import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { ExchangeKind, ExchangeMode, Balance } from "./exchanges/types";
import { PLAN_LIMITS, type PlanTier } from "./plans";

async function getTier(supabase: { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: { tier?: string } | null }> } } } }, userId: string): Promise<PlanTier> {
  const { data } = await supabase.from("subscriptions").select("tier").eq("user_id", userId).maybeSingle();
  return ((data?.tier as PlanTier) ?? "starter");
}

const credsSchema = z.object({
  exchange: z.enum(["binance", "coinbase", "alpaca"]),
  mode: z.enum(["live", "demo"]),
  apiKey: z.string().trim().min(4).max(512),
  apiSecret: z.string().trim().min(4).max(2048),
  passphrase: z.string().trim().max(256).optional().or(z.literal("")),
});

const createSchema = credsSchema.extend({
  label: z.string().trim().min(1).max(64),
});

export const testExchangeConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => credsSchema.parse(d))
  .handler(async ({ data }) => {
    const { createAdapter } = await import("./exchanges/adapters.server");
    const adapter = createAdapter(data.exchange as ExchangeKind, data.mode as ExchangeMode, {
      apiKey: data.apiKey,
      apiSecret: data.apiSecret,
      passphrase: data.passphrase || undefined,
    });
    try {
      const result = await adapter.testConnection();
      return { ok: true as const, info: result.info ?? "Connected" };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Connection failed" };
    }
  });

export const listExchangeAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("exchange_accounts")
      .select("id, exchange, mode, label, last_verified_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createExchangeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Plan limits
    const tier = await getTier(context.supabase as never, context.userId);
    const limits = PLAN_LIMITS[tier];
    if (data.mode === "live" && !limits.liveTrading) {
      throw new Error(`${limits.name} plan supports demo accounts only. Upgrade to enable live trading.`);
    }
    const { count } = await context.supabase
      .from("exchange_accounts")
      .select("id", { count: "exact", head: true });
    if ((count ?? 0) >= limits.maxExchanges) {
      throw new Error(`${limits.name} plan allows ${limits.maxExchanges} exchange account(s). Upgrade to add more.`);
    }

    const { createAdapter } = await import("./exchanges/adapters.server");
    const { encryptSecret } = await import("./crypto.server");

    const adapter = createAdapter(data.exchange as ExchangeKind, data.mode as ExchangeMode, {
      apiKey: data.apiKey,
      apiSecret: data.apiSecret,
      passphrase: data.passphrase || undefined,
    });
    // Verify before storing — refuse to save bad keys.
    try {
      await adapter.testConnection();
    } catch (e) {
      throw new Error(`Verification failed: ${e instanceof Error ? e.message : "unknown"}`);
    }

    const { data: row, error } = await context.supabase
      .from("exchange_accounts")
      .insert({
        user_id: context.userId,
        exchange: data.exchange,
        mode: data.mode,
        label: data.label,
        api_key_enc: encryptSecret(data.apiKey),
        api_secret_enc: encryptSecret(data.apiSecret),
        passphrase_enc: data.passphrase ? encryptSecret(data.passphrase) : null,
        last_verified_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteExchangeAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("exchange_accounts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getAccountBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; balances: Balance[] } | { ok: false; error: string }> => {
    const { data: row, error } = await context.supabase
      .from("exchange_accounts")
      .select("exchange, mode, api_key_enc, api_secret_enc, passphrase_enc")
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error(error?.message ?? "Account not found");

    const { decryptSecret } = await import("./crypto.server");
    const { createAdapter } = await import("./exchanges/adapters.server");
    const adapter = createAdapter(row.exchange as ExchangeKind, row.mode as ExchangeMode, {
      apiKey: decryptSecret(row.api_key_enc),
      apiSecret: decryptSecret(row.api_secret_enc),
      passphrase: row.passphrase_enc ? decryptSecret(row.passphrase_enc) : undefined,
    });
    try {
      const balances = await adapter.getBalances();
      return { ok: true as const, balances };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Failed" };
    }
  });