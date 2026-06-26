import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PLAN_LIMITS, type PlanTier } from "./plans";

export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("subscriptions")
      .select("tier, status, current_period_end, provider")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const tier = (data?.tier ?? "starter") as PlanTier;
    return {
      tier,
      status: data?.status ?? "active",
      current_period_end: data?.current_period_end ?? null,
      provider: data?.provider ?? null,
      limits: PLAN_LIMITS[tier],
    };
  });