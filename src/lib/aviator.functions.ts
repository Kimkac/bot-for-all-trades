import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AviatorWallet {
  id: string;
  balance: number;
}

export interface AviatorRound {
  id: string;
  round_number: number;
  crash_point: number;
  status: "pending" | "flying" | "crashed";
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface AviatorBet {
  id: string;
  round_id: string;
  amount: number;
  auto_cashout: number | null;
  cashout_multiplier: number | null;
  payout: number;
  status: "active" | "cashed_out" | "lost";
  created_at: string;
  cashed_out_at: string | null;
}

export interface AviatorDeposit {
  id: string;
  amount_usd: number;
  payment_id: string | null;
  pay_address: string | null;
  pay_amount: number | null;
  pay_currency: string | null;
  status: "pending" | "confirmed" | "expired" | "failed";
  created_at: string;
  confirmed_at: string | null;
}

export const getWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_or_create_wallet");
    if (error) throw new Error(error.message);
    return {
      id: (data as AviatorWallet).id,
      balance: Number((data as AviatorWallet).balance),
    } as AviatorWallet;
  });

export const getRecentRounds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("aviator_rounds")
      .select("id, round_number, crash_point, status, created_at, started_at, ended_at")
      .order("round_number", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []) as AviatorRound[];
  });

export const getMyBets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("aviator_bets")
      .select("id, round_id, amount, auto_cashout, cashout_multiplier, payout, status, created_at, cashed_out_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as AviatorBet[];
  });

export const getMyDeposits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("aviator_deposits")
      .select("id, amount_usd, payment_id, pay_address, pay_amount, pay_currency, status, created_at, confirmed_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []) as AviatorDeposit[];
  });

export const placeBet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { round_id: string; amount: number; auto_cashout?: number | null }) => {
    if (!input.round_id) throw new Error("Round ID is required");
    if (typeof input.amount !== "number" || input.amount <= 0)
      throw new Error("Bet amount must be positive");
    return input;
  })
  .handler(async ({ context, data }) => {
    const { data: result, error } = await context.supabase.rpc("place_aviator_bet", {
      p_round_id: data.round_id,
      p_amount: data.amount,
      p_auto_cashout: data.auto_cashout ?? null,
    });
    if (error) throw new Error(error.message);
    return result as AviatorBet;
  });

export const cashoutBet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { bet_id: string; current_multiplier: number }) => {
    if (!input.bet_id) throw new Error("Bet ID is required");
    if (typeof input.current_multiplier !== "number" || input.current_multiplier < 1)
      throw new Error("Invalid multiplier");
    return input;
  })
  .handler(async ({ context, data }) => {
    const { data: result, error } = await context.supabase.rpc("cashout_aviator_bet", {
      p_bet_id: data.bet_id,
      p_current_multiplier: data.current_multiplier,
    });
    if (error) throw new Error(error.message);
    return result as AviatorBet;
  });

export const createDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { amount: number }) => {
    if (typeof input.amount !== "number" || input.amount <= 0)
      throw new Error("Deposit amount must be positive");
    return input;
  })
  .handler(async ({ context, data }) => {
    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey) throw new Error("NOWPAYMENTS_API_KEY not configured");

    const { getNowPaymentsBase, getMinAmount } = await import("@/lib/nowpayments.server");

    const payCurrency = "usdttrc20";

    try {
      const min = await getMinAmount(apiKey, payCurrency);
      if (min.min_usd !== null && data.amount < min.min_usd) {
        throw new Error(
          `Minimum deposit is ~$${min.min_usd.toFixed(2)} (${min.min_amount} USDT TRC20)`,
        );
      }
    } catch {
      // skip min check if unavailable
    }

    const base = await getNowPaymentsBase(apiKey);
    const reference = `aviator-deposit-${context.userId.slice(0, 8)}`;

    const res = await fetch(`${base}/payment`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        price_amount: data.amount,
        price_currency: "usd",
        pay_currency: payCurrency,
        order_id: `${reference}-${Date.now()}`,
        order_description: "Aviator Wallet Deposit",
      }),
    });

    const resData = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(
        (resData as { message?: string }).message ?? `NOWPayments error ${res.status}`,
      );
    }

    const paymentId = resData.payment_id as string | undefined;
    const payAddress = resData.pay_address as string | undefined;
    const payAmount = resData.pay_amount as number | undefined;
    const payCurrencyResp = (resData.pay_currency as string | undefined) ?? payCurrency;

    const { data: depositRow, error: insertErr } = await context.supabase
      .from("aviator_deposits")
      .insert({
        user_id: context.userId,
        amount_usd: data.amount,
        payment_id: paymentId ?? null,
        pay_address: payAddress ?? null,
        pay_amount: payAmount ?? null,
        pay_currency: payCurrencyResp,
        status: "pending",
      })
      .select("id")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    return {
      deposit_id: depositRow.id,
      payment_id: paymentId ?? null,
      pay_address: payAddress ?? null,
      pay_amount: payAmount ?? null,
      pay_currency: payCurrencyResp,
    };
  });

export const checkDepositStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { deposit_id: string }) => input)
  .handler(async ({ context, data }) => {
    const { data: dep, error } = await context.supabase
      .from("aviator_deposits")
      .select("id, status, payment_id, amount_usd")
      .eq("id", data.deposit_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!dep) throw new Error("Deposit not found");

    if (dep.status === "confirmed") {
      return { status: "confirmed" as const, message: "Deposit already confirmed" };
    }

    const apiKey = process.env.NOWPAYMENTS_API_KEY;
    if (!apiKey || !dep.payment_id) {
      return { status: dep.status as "pending", message: "Payment ID missing" };
    }

    const { getNowPaymentsBase } = await import("@/lib/nowpayments.server");
    const base = await getNowPaymentsBase(apiKey);

    const res = await fetch(`${base}/payment/${encodeURIComponent(dep.payment_id)}`, {
      headers: { "x-api-key": apiKey },
    });
    const resData = (await res.json().catch(() => ({}))) as {
      payment_status?: string;
      message?: string;
    };

    if (!res.ok) {
      throw new Error(resData.message ?? `NOWPayments error ${res.status}`);
    }

    const npStatus = resData.payment_status ?? "waiting";

    if (npStatus === "finished" || npStatus === "confirmed") {
      const { error: rpcErr } = await context.supabase.rpc("credit_aviator_deposit", {
        p_deposit_id: data.deposit_id,
      });
      if (rpcErr) throw new Error(rpcErr.message);
      return { status: "confirmed" as const, message: "Payment confirmed! Your balance has been credited." };
    }

    return { status: "pending" as const, message: `Payment status: ${npStatus}` };
  });
