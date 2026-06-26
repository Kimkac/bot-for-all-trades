import { createFileRoute } from "@tanstack/react-router";
import { Check, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

function BillingPage() {
  const fetchSub = useServerFn(getMySubscription);
  const { data: sub } = useQuery({ queryKey: ["my-subscription"], queryFn: () => fetchSub() });
  const currentPlanId = (sub?.tier ?? "starter") as PlanTier;
  const currentName = PLAN_LIMITS[currentPlanId].name;

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
            Tier limits are enforced now; checkout activates once a payment provider is connected.
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
                  disabled={active}
                  onClick={() => toast.info("Checkout opens once payments are enabled on this workspace.")}
                >
                  {active ? "Current plan" : `Upgrade — $${p.price}/mo`}
                </Button>
              </Card>
            );
          })}
        </div>

        <Card className="p-5 text-sm text-muted-foreground">
          All plans include AES-256 encrypted API key storage, demo & live mode support, and the same strategy engine.
          Cancel anytime. Prices in USD.
        </Card>
      </div>
    </>
  );
}