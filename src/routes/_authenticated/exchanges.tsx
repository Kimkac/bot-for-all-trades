import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/exchanges")({
  head: () => ({ meta: [{ title: "Exchanges — Tradedesk" }] }),
  component: ExchangesPage,
});

function ExchangesPage() {
  return (
    <>
      <PageHeader
        title="Exchanges"
        description="API connections to Binance, Coinbase, and Alpaca."
        actions={
          <Button asChild>
            <Link to="/exchanges">
              <Plus className="mr-1.5 h-4 w-4" /> Connect exchange
            </Link>
          </Button>
        }
      />
      <div className="p-8">
        <Card className="grid place-items-center p-16 text-center">
          <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">No connections yet</div>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Add an exchange API key (testnet recommended) to enable bots.
            Adapters and the connection form are wired in the next build step.
          </p>
        </Card>
      </div>
    </>
  );
}