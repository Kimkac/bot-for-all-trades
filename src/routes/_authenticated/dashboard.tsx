import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Tradedesk" }] }),
  component: Dashboard,
});

function Dashboard() {
  const stats = [
    { label: "Total equity", value: "$0.00", sub: "Connect an exchange" },
    { label: "Open P&L", value: "$0.00", sub: "No active bots" },
    { label: "Active bots", value: "0", sub: "Create one to begin" },
    { label: "Trades today", value: "0", sub: "—" },
  ];
  return (
    <>
      <PageHeader title="Portfolio" description="Aggregate snapshot across every connected exchange." />
      <div className="space-y-6 p-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label} className="p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</div>
              <div className="mt-2 font-mono text-3xl">{s.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s.sub}</div>
            </Card>
          ))}
        </div>

        <Card className="p-8 text-sm text-muted-foreground">
          <p>Welcome to Tradedesk. Get started in two steps:</p>
          <ol className="mt-3 list-decimal space-y-1 pl-5">
            <li>Connect an exchange (testnet keys recommended).</li>
            <li>Create a bot, pick a strategy, and start it.</li>
          </ol>
        </Card>
      </div>
    </>
  );
}