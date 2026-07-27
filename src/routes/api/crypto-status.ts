import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/crypto-status")({
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
        const paymentId = url.searchParams.get("payment_id");
        if (!paymentId) {
          return Response.json({ success: false, error: "payment_id required" }, { status: 400 });
        }

        try {
          const res = await fetch(
            `https://api.sandbox.nowpayments.io/v1/payment/${encodeURIComponent(paymentId)}`,
            { headers: { "x-api-key": apiKey } },
          );
          const data = (await res.json().catch(() => ({}))) as {
            payment_status?: string;
            message?: string;
            actually_paid?: number;
            pay_amount?: number;
          };
          if (!res.ok) {
            return Response.json({
              success: false,
              error: data.message ?? `NOWPayments error ${res.status}`,
            });
          }
          return Response.json({
            success: true,
            payment_status: data.payment_status ?? "waiting",
            actually_paid: data.actually_paid ?? 0,
            pay_amount: data.pay_amount ?? 0,
          });
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