import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle, Check, CheckCircle2, Copy, FlaskConical, Loader as Loader2,
  Sparkles, Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
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
  const [testResponse, setTestResponse] = useState<ChargeResult | null>(null);

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

  const testChargeMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/crypto-charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 1, reference: "test-001" }),
      });
      return (await res.json()) as ChargeResult;
    },
    onSuccess: (r) => {
      setTestResponse(r);
      if (r.success) {
        toast.success("Test charge created — response shown below");
      } else {
        toast.error(r.error ?? "Test charge failed");
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
          <DialogTitle>Complete your payment</DialogTitle>
          <DialogDescription>
            Send exactly <span className="font-mono font-semibold text-foreground">{amount} {currency}</span> to this address to activate your {plan?.name} plan.
          </DialogDescription>
        </DialogHeader>

        <PaymentBody
          amount={amount}
          address={address}
          currency={currency}
          paymentId={charge.payment_id ?? ""}
          onCopy={copy}
        />
      </DialogContent>
    </Dialog>
  );
}

function PaymentBody({
  amount, address, currency, paymentId, onCopy,
}: {
  amount: number;
  address: string;
  currency: string;
  paymentId: string;
  onCopy: (v: string) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function checkStatus() {
    setChecking(true);
    try {
      const res = await fetch(`/api/crypto-status?payment_id=${encodeURIComponent(paymentId)}`);
      const data = (await res.json()) as { success: boolean; payment_status?: string; error?: string };
      if (!data.success) {
        toast.error(data.error ?? "Failed to check status");
        return;
      }
      setStatus(data.payment_status ?? "waiting");
      if (data.payment_status === "finished" || data.payment_status === "confirmed") {
        toast.success("Payment confirmed — your plan is active");
      } else if (data.payment_status === "waiting") {
        toast.info("Waiting for payment to arrive on-chain");
      } else {
        toast.info(`Payment status: ${data.payment_status}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to check status");
    } finally {
      setChecking(false);
    }
  }

  const confirmed = status === "finished" || status === "confirmed";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount</div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="font-mono text-2xl">{amount} {currency}</span>
          <Button size="sm" variant="ghost" onClick={() => onCopy(String(amount))} aria-label="Copy amount">
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs text-muted-foreground">
          Send exactly <span className="font-mono text-foreground">{amount} USDT TRC20</span> to this address:
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-zinc-950 p-3 text-emerald-300">
          <span className="break-all font-mono text-sm">{address}</span>
          <Button size="sm" variant="ghost" className="text-emerald-300 hover:text-emerald-200" onClick={() => onCopy(address)} aria-label="Copy wallet address">
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="mt-2 font-mono text-[11px] text-muted-foreground">
          Payment ID: <span className="text-foreground">{paymentId}</span>
        </div>
      </div>

      <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span><strong>Only send USDT TRC20.</strong> Wrong network = lost funds.</span>
      </div>

      {status && (
        <div className={`flex items-center gap-2 rounded-md border p-3 text-xs ${
          confirmed
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "border-border bg-muted/30 text-muted-foreground"
        }`}>
          {confirmed ? <CheckCircle2 className="h-4 w-4" /> : <Loader2 className="h-4 w-4" />}
          <span>Status: <span className="font-mono">{status}</span></span>
        </div>
      )}

      <Button className="w-full" onClick={checkStatus} disabled={checking || !paymentId}>
        {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
        I've sent the payment
      </Button>
    </div>
  );
}