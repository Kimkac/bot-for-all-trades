import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getPortfolioOverview } from "@/lib/portfolio.functions";
import { EXCHANGES } from "@/lib/exchanges/types";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Portfolio — Tradedesk" }] }),
  component: Dashboard,
});

function fmt(n: number) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Dashboard() {
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getPortfolioOverview);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["portfolio-overview"],
    queryFn: () => fetchOverview(),
    refetchInterval: 30_000,
  });

  if (isLoading || !data) {
    return (
      <>
        <PageHeader title="Portfolio" description="Aggregate snapshot across every connected exchange." />
        <div className="grid min-h-[40vh] place-items-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
      </>
    );
  }

  const stats = [
    { label: "Realized P&L", value: fmt(data.totals.realized), tone: data.totals.realized >= 0 ? "up" : "down" },
    { label: "Unrealized P&L", value: fmt(data.totals.unrealized), tone: data.totals.unrealized >= 0 ? "up" : "down" },
    { label: "Active bots", value: `${data.active_bots} / ${data.total_bots}`, tone: "neutral" as const },
    { label: "Trades today", value: String(data.trades_today), tone: "neutral" as const },
  ];

  return (
    <>
      <PageHeader
        title="Portfolio"
        description="Aggregate snapshot across every connected exchange."
        actions={
          <Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["portfolio-overview"] })}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />
      <div className="space-y-6 p-8">
        {data.alerts.length > 0 && (
          <Card className="border-destructive/40 bg-destructive/10 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" /> Risk alerts ({data.alerts.length})
            </div>
            <ul className="space-y-1.5 text-xs">
              {data.alerts.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3">
                  <Link to="/bots/$botId" params={{ botId: a.id }} className="hover:underline">
                    <span className="font-medium">{a.name}</span> · {a.symbol}
                  </Link>
                  <span className="text-destructive">
                    {a.risk_breached ? `Daily loss ${fmt(a.daily_loss)} ≥ limit ${fmt(a.max_daily_loss)}` : a.last_error}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label} className="p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</div>
              <div className={`mt-2 font-mono text-3xl ${s.tone === "up" ? "text-emerald-400" : s.tone === "down" ? "text-destructive" : ""}`}>
                {s.value}
              </div>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Bots P&L</div>
            {data.bots.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No bots yet. <Link to="/bots" className="underline">Create one →</Link>
              </div>
            ) : (
              <ul className="space-y-1">
                {data.bots.map((b) => (
                  <li key={b.id} className="flex items-center justify-between rounded px-2 py-2 hover:bg-muted/30">
                    <Link to="/bots/$botId" params={{ botId: b.id }} className="min-w-0">
                      <div className="truncate text-sm font-medium">{b.name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {b.symbol} · {b.trades} trades · {b.status}
                      </div>
                    </Link>
                    <div className="flex items-center gap-1.5">
                      {b.total >= 0
                        ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                        : <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
                      <span className={`font-mono text-sm ${b.total >= 0 ? "text-emerald-400" : "text-destructive"}`}>
                        {fmt(b.total)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Exchange balances</div>
            {data.accounts.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No exchanges connected. <Link to="/exchanges" className="underline">Connect one →</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {data.accounts.map((a) => (
                  <div key={a.account_id} className="rounded border border-border/40 p-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="text-sm font-medium">
                        {a.label} <span className="text-muted-foreground">· {EXCHANGES[a.exchange]?.label ?? a.exchange}</span>
                      </div>
                      <Badge variant={a.mode === "live" ? "destructive" : "outline"} className="text-[10px] uppercase">{a.mode}</Badge>
                    </div>
                    {!a.ok ? (
                      <div className="text-xs text-destructive">{a.error}</div>
                    ) : a.balances.length === 0 ? (
                      <div className="text-xs text-muted-foreground">No balances.</div>
                    ) : (
                      <div className="flex flex-wrap gap-2 font-mono text-xs">
                        {a.balances.slice(0, 8).map((b) => (
                          <span key={b.asset} className="rounded bg-muted/50 px-2 py-0.5">
                            {b.asset} <span className="text-muted-foreground">{b.total}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}