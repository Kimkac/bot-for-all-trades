import { createFileRoute } from "@tanstack/react-router";
import { getNowPaymentsBase, maskKey } from "@/lib/nowpayments.server";

export const Route = createFileRoute("/api/crypto-charge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.NOWPAYMENTS_API_KEY;
        if (!apiKey) {
          console.error("[crypto-charge] NOWPAYMENTS_API_KEY is missing from env");
          return Response.json(
            { success: false, error: "NOWPAYMENTS_API_KEY not configured" },
            { status: 500 },
          );
        }
        console.log(`[crypto-charge] using API key ${maskKey(apiKey)}`);

        let body: { amount?: number; reference?: string };
        try {
          body = await request.json();
        } catch {
          return Response.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
        }

        const { amount, reference } = body;
        if (typeof amount !== "number" || amount <= 0 || typeof reference !== "string" || !reference) {
          return Response.json(
            { success: false, error: "amount (number > 0) and reference (string) are required" },
            { status: 400 },
          );
        }

        try {
          const base = await getNowPaymentsBase(apiKey);
          const res = await fetch(`${base}/payment`, {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              price_amount: amount,
              price_currency: "usd",
              pay_currency: "usdttrc20",
              order_id: `${reference}-${Date.now()}`,
              order_description: "Trading Bot Payment",
            }),
          });

          const data = await res.json().catch(() => ({}) as Record<string, unknown>);

          if (!res.ok) {
            console.error(`[crypto-charge] ${base}/payment -> ${res.status}`, data);
            return Response.json({
              success: false,
              error: (data as { message?: string }).message ?? `NOWPayments error ${res.status}`,
            });
          }

          const r = data as {
            payment_id?: string;
            pay_address?: string;
            pay_amount?: number;
            pay_currency?: string;
          };

          return Response.json({
            success: true,
            payment_id: r.payment_id,
            pay_address: r.pay_address,
            pay_amount: r.pay_amount,
            pay_currency: r.pay_currency,
          });
        } catch (err) {
          console.error("[crypto-charge]", err);
          return Response.json(
            { success: false, error: err instanceof Error ? err.message : "Request failed" },
            { status: 502 },
          );
        }
      },
    },
  },
});