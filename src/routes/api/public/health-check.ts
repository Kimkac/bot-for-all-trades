import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const PROD_BASE = "https://bot-for-all-trades.lovable.app";

async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const requested = url.searchParams.get("base");
    // Only allow lovable-hosted origins to be probed.
    const base =
      requested && /^https:\/\/[a-z0-9-]+(--[a-z0-9-]+)?\.lovable\.app$/i.test(requested)
        ? requested
        : PROD_BASE;

    const { runHealthCheck } = await import("@/lib/health.server");
    const record = await runHealthCheck(base);
    return new Response(JSON.stringify(record), {
      status: record.ok ? 200 : 503,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (e) {
    console.error("[health-check]", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "health check failed" }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }
}

export const Route = createFileRoute("/api/public/health-check")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});