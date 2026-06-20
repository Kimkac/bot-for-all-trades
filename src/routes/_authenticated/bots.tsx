import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/bots")({
  head: () => ({ meta: [{ title: "Bots — Tradedesk" }] }),
  component: BotsPage,
});

function BotsPage() {
  return (
    <>
      <PageHeader title="Bots" description="Configurable trading strategies running against your exchanges." />
      <div className="p-8">
        <Card className="grid place-items-center p-16 text-center">
          <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">No bots yet</div>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Connect an exchange first, then create a bot with the strategy and parameters you want.
          </p>
        </Card>
      </div>
    </>
  );
}