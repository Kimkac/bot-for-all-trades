import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

export const Route = createFileRoute("/api/public/bot-tick")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async () => {
        try {
          const { runAllRunningBots } = await import("@/lib/bot-tick.server");
          const results = await runAllRunningBots();
          return new Response(
            JSON.stringify({ ok: true, count: results.length, results }),
            { headers: { "Content-Type": "application/json", ...CORS } },
          );
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "tick failed" }),
            { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
          );
        }
      },
    },
  },
});