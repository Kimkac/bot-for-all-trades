// Post-publish health check: pings every key route/API and records the result.

export type HealthTarget = { path: string; label: string; method?: "GET" | "POST" };

export const HEALTH_TARGETS: HealthTarget[] = [
  { path: "/", label: "Landing page" },
  { path: "/auth", label: "Sign in" },
  { path: "/reset-password", label: "Password reset" },
  { path: "/dashboard", label: "Dashboard" },
  { path: "/bots", label: "Bots" },
  { path: "/exchanges", label: "Exchanges" },
  { path: "/billing", label: "Plans & billing" },
  { path: "/sitemap.xml", label: "Sitemap" },
  { path: "/robots.txt", label: "robots.txt" },
  { path: "/api/crypto-min?currency=usdttrc20", label: "NOWPayments minimum API" },
];

export type HealthResult = {
  path: string;
  label: string;
  status: number | null;
  ok: boolean;
  ms: number;
  error?: string;
};

const TIMEOUT_MS = 12_000;

async function probe(base: string, target: HealthTarget): Promise<HealthResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${target.path}`, {
      method: target.method ?? "GET",
      headers: { "user-agent": "tradedesk-healthcheck/1.0" },
      signal: controller.signal,
    });
    return {
      path: target.path,
      label: target.label,
      status: res.status,
      ok: res.status === 200,
      ms: Date.now() - started,
    };
  } catch (e) {
    return {
      path: target.path,
      label: target.label,
      status: null,
      ok: false,
      ms: Date.now() - started,
      error: e instanceof Error ? e.message : "request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runHealthCheck(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, "");
  const started = Date.now();
  const results = await Promise.all(HEALTH_TARGETS.map((t) => probe(base, t)));
  const failed = results.filter((r) => !r.ok);
  const record = {
    ok: failed.length === 0,
    failed_count: failed.length,
    duration_ms: Date.now() - started,
    base_url: base,
    results,
  };

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("health_checks").insert(record);
    // Keep only the most recent 200 runs.
    const { data: keep } = await supabaseAdmin
      .from("health_checks")
      .select("checked_at")
      .order("checked_at", { ascending: false })
      .range(200, 200);
    const cutoff = keep?.[0]?.checked_at;
    if (cutoff) {
      await supabaseAdmin.from("health_checks").delete().lt("checked_at", cutoff);
    }
  } catch (e) {
    console.error("[health-check] failed to persist result", e);
  }

  if (!record.ok) {
    console.error(
      `[health-check] ALERT ${failed.length}/${results.length} checks failing on ${base}: ` +
        failed.map((f) => `${f.path} -> ${f.status ?? f.error}`).join(", "),
    );
  } else {
    console.log(`[health-check] all ${results.length} checks passed on ${base}`);
  }

  return record;
}