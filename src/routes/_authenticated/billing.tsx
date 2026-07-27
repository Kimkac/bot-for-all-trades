import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, CheckCircle2, Copy, Loader as Loader2, Sparkles, Wallet } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { getMySubscription } from "@/lib/subscriptions.functions";
import { PLAN_LIMITS, type PlanTier } from "@/lib/plans";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Plans & Billing — Tradedesk" }] }),
  component: BillingPage,
});

interface Plan {
  id: string;
  name: string;
  price: number;
  tagline: string;
  features: string[];
  recommended?: boolean;
  limits: { bots: string; exchanges: string; tickInterval: string };
}

const PLANS: Plan[] = [
  {
    id: "starter", name: "Starter", price: 10,
    tagline: "Dip a toe — paper trade and one live bot.",
    limits: { bots: "1 bot", exchanges: "1 exchange", tickInterval: "1 min ticks" },
    features: ["1 active bot", "1 exchange connection", "All 4 strategies", "Email risk alerts"],
  },
  {
    id: "trader", name: "Trader", price: 30, recommended: true,
    tagline: "For active retail traders running multiple strategies.",
    limits: { bots: "5 bots", exchanges: "3 exchanges", tickInterval: "30s ticks" },
    features: ["5 active bots", "3 exchange connections", "Per-bot P&L analytics", "Priority support"],
  },
  {
    id: "pro", name: "Pro", price: 60,
    tagline: "Multi-account portfolio management.",
    limits: { bots: "20 bots", exchanges: "10 exchanges", tickInterval: "10s ticks" },
    features: ["20 active bots", "10 exchange connections", "Advanced risk engine", "API access", "Backtesting"],
  },
  {
    id: "elite", name: "Elite", price: 100,
    tagline: "Unlimited scale — for serious operators.",
    limits: { bots: "Unlimited", exchanges: "Unlimited", tickInterval: "Real-time" },
    features: ["Unlimited bots", "Unlimited exchanges", "Real-time websocket ticks", "Custom strategy SDK", "Dedicated support"],
  },
];

interface ChargeResult {
  success: boolean;
  payment_id?: string;
  pay_address?: string;
  pay_amount?: number;
  pay_currency?: string;
  error?: string;
}

function BillingPage() {
  const fetchSub = useServerFn(getMySubscription);
  const qc = useQueryClient();
  const { data: sub } = useQuery({ queryKey: ["my-subscription"], queryFn: () => fetchSub() });
  const currentPlanId = (sub?.tier ?? "starter") as PlanTier;
  const currentName = PLAN_LIMITS[currentPlanId].name;

  const [pending, setPending] = useState<Plan | null>(null);
  const [charge, setCharge] = useState<ChargeResult | null>(null);

  const chargeMut = useMutation({
    mutationFn: async (plan: Plan) => {
      const res = await fetch("/api/crypto-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: plan.price, reference: plan.id }),
      });
      return (await res.json()) as ChargeResult;
    },
    onSuccess: (r, plan) => {
      if (r.success) {
        setCharge(r);
        setPending(plan);
      } else {
        toast.error(r.error ?? "Payment failed to start");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function closeDialog() {
    setCharge(null);
    setPending(null);
    qc.invalidateQueries({ queryKey: ["my-subscription"] });
  }

  return (
    <>
      <PageHeader
        title="Plans & Billing"
        description="Pick the tier that matches your trading scale."
      />
      <div className="space-y-6 p-8">
        <Card className="flex items-center gap-3 border-primary/30 bg-primary/5 p-4 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>
            Currently on <span className="font-medium">{currentName}</span>
            {sub?.current_period_end ? ` · renews ${new Date(sub.current_period_end).toLocaleDateString()}` : ""}.
            Pay with crypto via NOWPayments — USDT (TRC20). Your plan activates once payment is confirmed.
          </span>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((p) => {
            const active = p.id === currentPlanId;
            return (
              <Card
                key={p.id}
                className={`relative flex flex-col p-6 ${
                  p.recommended ? "border-primary/50 ring-1 ring-primary/30" : ""
                }`}
              >
                {p.recommended && (
                  <Badge className="absolute -top-2 right-4 text-[10px] uppercase">Recommended</Badge>
                )}
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{p.name}</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-mono text-4xl">${p.price}</span>
                  <span className="text-xs text-muted-foreground">/ month</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{p.tagline}</p>

                <div className="mt-4 space-y-1 rounded-md border border-border/40 bg-muted/20 p-3 font-mono text-[11px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">Bots</span><span>{p.limits.bots}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Exchanges</span><span>{p.limits.exchanges}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Ticks</span><span>{p.limits.tickInterval}</span></div>
                </div>

                <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className="mt-5"
                  variant={active ? "outline" : p.recommended ? "default" : "secondary"}
                  disabled={active || chargeMut.isPending}
                  onClick={() => chargeMut.mutate(p)}
                >
                  {chargeMut.isPending && chargeMut.variables?.id === p.id ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : null}
                  {active ? "Current plan" : `Upgrade — ${p.price}/mo`}
                </Button>
              </Card>
            );
          })}
        </div>

        <Card className="p-5 text-sm text-muted-foreground">
          All plans include AES-256 encrypted API key storage, demo & live mode support, and the same strategy engine.
          Cancel anytime. Prices in USD. Crypto payments via NOWPayments (USDT TRC20).
        </Card>
      </div>

      <PaymentDialog
        open={!!charge}
        plan={pending}
        charge={charge}
        onOpenChange={(v) => { if (!v) closeDialog(); }}
      />
    </>
  );
}

function PaymentDialog({
  open, plan, charge, onOpenChange,
}: {
  open: boolean;
  plan: Plan | null;
  charge: ChargeResult | null;
  onOpenChange: (v: boolean) => void;
}) {
  if (!charge || !charge.success) return null;
  const amount = charge.pay_amount ?? 0;
  const address = charge.pay_address ?? "";
  const currency = (charge.pay_currency ?? "usdttrc20").toUpperCase();

  function copy(v: string) {
    navigator.clipboard.writeText(v);
    toast.success("Copied to clipboard");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
            <Wallet className="h-5 w-5" />
          </div>
          <DialogTitle>Pay with crypto</DialogTitle>
          <DialogDescription>
            Send the exact amount below to activate your {plan?.name} plan.
            Payment ID: <span className="font-mono">{charge.payment_id}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="font-mono text-2xl">{amount} {currency}</span>
              <Button size="sm" variant="ghost" onClick={() => copy(String(amount))}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              ≈ ${plan?.price} USD
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Wallet address</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="break-all font-mono text-sm">{address}</span>
              <Button size="sm" variant="ghost" onClick={() => copy(address)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
            Send the exact amount in a single transaction. Your plan activates automatically once the payment is confirmed on-chain. Do not close this window until you have sent the payment.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>I have paid</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}