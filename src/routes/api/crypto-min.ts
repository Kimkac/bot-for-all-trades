import { createFileRoute } from "@tanstack/react-router";
import { getMinAmount } from "@/lib/nowpayments.server";

export const Route = createFileRoute("/api/crypto-min")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const apiKey = process.env.NOWPAYMENTS_API_KEY;
        if (!apiKey) {
          return Response.json(
            { success: false, error: "NOWPAYMENTS_API_KEY not configured" },
            { status: 500 },
          );
        }
        const url = new URL(request.url);
        const currency = (url.searchParams.get("currency") ?? "usdttrc20").toLowerCase();
        try {
          const info = await getMinAmount(apiKey, currency);
          return Response.json({ success: true, ...info });
        } catch (err) {
          return Response.json(
            { success: false, error: err instanceof Error ? err.message : "Request failed" },
            { status: 502 },
          );
        }
      },
    },
  },
});