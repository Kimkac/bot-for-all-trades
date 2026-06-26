import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, FlaskConical, Loader2, Play, RefreshCw, Square, Zap } from "lucide-react";
import {
  createChart, CandlestickSeries, LineSeries, type IChartApi,
} from "lightweight-charts";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { getBot, getBotActivity, getCandles, runBotTickNow, setBotStatus } from "@/lib/bots.functions";
import { runBacktest } from "@/lib/backtest.functions";
import { STRATEGIES, type StrategyKind } from "@/lib/strategies/types";

export const Route = createFileRoute("/_authenticated/bots/$botId")({
  head: () => ({ meta: [{ title: "Bot — Tradedesk" }] }),
  component: BotDetailPage,
});

function BotDetailPage() {
  const { botId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchBot = useServerFn(getBot);
  const fetchActivity = useServerFn(getBotActivity);
  const fetchCandles = useServerFn(getCandles);
  const setStatus = useServerFn(setBotStatus);
  const tickNow = useServerFn(runBotTickNow);
  const [backtestOpen, setBacktestOpen] = useState(false);

  const { data: bot, isLoading } = useQuery({
    queryKey: ["bot", botId],
    queryFn: () => fetchBot({ data: { id: botId } }),
  });
  const { data: activity } = useQuery({
    queryKey: ["bot-activity", botId],
    queryFn: () => fetchActivity({ data: { id: botId } }),
    refetchInterval: 15_000,
  });
  const { data: candles } = useQuery({
    queryKey: ["bot-candles", botId],
    queryFn: () => fetchCandles({ data: { id: botId, limit: 200 } }),
    refetchInterval: 30_000,
  });

  const startStop = useMutation({
    mutationFn: (running: boolean) => setStatus({ data: { id: botId, running } }),
    onSuccess: (_d, running) => {
      toast.success(running ? "Bot started" : "Bot stopped");
      qc.invalidateQueries({ queryKey: ["bot", botId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const tick = useMutation({
    mutationFn: () => tickNow({ data: { id: botId } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Tick: ${r.signal} — ${r.reason}`);
      else toast.error(r.error);
      qc.invalidateQueries({ queryKey: ["bot-activity", botId] });
      qc.invalidateQueries({ queryKey: ["bot-candles", botId] });
      qc.invalidateQueries({ queryKey: ["bot", botId] });
      qc.invalidateQueries({ queryKey: ["portfolio-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !bot) {
    return (
      <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
    );
  }

  const strat = STRATEGIES[bot.strategy as StrategyKind];
  const running = bot.status === "running";
  const stats = activity?.stats;
  const fmt = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const riskBreached = stats && bot.max_daily_loss > 0 && stats.daily_loss >= bot.max_daily_loss;

  return (
    <>
      <PageHeader
        title={bot.name}
        description={`${bot.symbol} · ${bot.timeframe} · ${strat?.label ?? bot.strategy}`}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => navigate({ to: "/bots" })}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
            <Button variant="outline" onClick={() => tick.mutate()} disabled={tick.isPending}>
              {tick.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Zap className="mr-1.5 h-4 w-4" />}
              Tick now
            </Button>
            <Button variant="outline" onClick={() => setBacktestOpen(true)}>
              <FlaskConical className="mr-1.5 h-4 w-4" /> Backtest
            </Button>
            {running ? (
              <Button variant="outline" onClick={() => startStop.mutate(false)}>
                <Square className="mr-1.5 h-4 w-4" /> Stop
              </Button>
            ) : (
              <Button onClick={() => startStop.mutate(true)}>
                <Play className="mr-1.5 h-4 w-4" /> Start
              </Button>
            )}
          </div>
        }
      />
      <div className="grid gap-4 p-8 xl:grid-cols-3">
        {(riskBreached || bot.last_error) && (
          <Card className="border-destructive/40 bg-destructive/10 p-4 xl:col-span-3">
            <div className="flex items-center gap-2 text-sm text-destructive">
              ⚠ {riskBreached
                ? `Daily loss ${fmt(stats!.daily_loss)} reached limit ${fmt(Number(bot.max_daily_loss))} — bot auto-stopped.`
                : bot.last_error}
            </div>
          </Card>
        )}

        {stats && (
          <div className="grid gap-3 sm:grid-cols-4 xl:col-span-3">
            <Card className="p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total P&L</div>
              <div className={`mt-1 font-mono text-2xl ${stats.total >= 0 ? "text-emerald-400" : "text-destructive"}`}>{fmt(stats.total)}</div>
              <div className="text-[10px] text-muted-foreground">Realized {fmt(stats.realized)} · Unrl {fmt(stats.unrealized)}</div>
            </Card>
            <Card className="p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Position</div>
              <div className="mt-1 font-mono text-2xl">{stats.position}</div>
              <div className="text-[10px] text-muted-foreground">Avg cost {stats.cost_basis ? stats.cost_basis.toFixed(4) : "—"}</div>
            </Card>
            <Card className="p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Win rate</div>
              <div className="mt-1 font-mono text-2xl">{stats.wins + stats.losses > 0 ? `${(stats.win_rate * 100).toFixed(0)}%` : "—"}</div>
              <div className="text-[10px] text-muted-foreground">{stats.wins}W / {stats.losses}L · {stats.trades_count} trades</div>
            </Card>
            <Card className="p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Today</div>
              <div className={`mt-1 font-mono text-2xl ${stats.daily_realized >= 0 ? "text-emerald-400" : "text-destructive"}`}>{fmt(stats.daily_realized)}</div>
              <div className="text-[10px] text-muted-foreground">{stats.trades_today} trades · loss cap {bot.max_daily_loss ? fmt(Number(bot.max_daily_loss)) : "off"}</div>
            </Card>
          </div>
        )}

        <Card className="p-4 xl:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Price</div>
            <Badge variant={running ? "default" : "secondary"} className="text-[10px] uppercase">{bot.status}</Badge>
          </div>
          <PriceChart
            candles={candles && "ok" in candles && candles.ok ? candles.candles : []}
            error={candles && "ok" in candles && !candles.ok ? candles.error : null}
          />
        </Card>

        <Card className="p-4">
          <div className="mb-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">Equity</div>
          <EquityChart points={activity?.equity ?? []} />
        </Card>

        <Card className="p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Trades</div>
            <Link to="/bots" className="text-xs text-muted-foreground hover:underline">All bots →</Link>
          </div>
          {!activity?.trades.length ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No trades yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left font-mono text-xs uppercase text-muted-foreground">
                  <tr><th className="py-1.5">Time</th><th>Side</th><th className="text-right">Qty</th><th className="text-right">Price</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {activity.trades.map((t) => (
                    <tr key={t.id} className="border-t border-border/40">
                      <td className="py-1.5 font-mono text-xs">{new Date(t.ts).toLocaleString()}</td>
                      <td>
                        <Badge variant={t.side === "buy" ? "default" : "destructive"} className="text-[10px] uppercase">
                          {t.side}
                        </Badge>
                      </td>
                      <td className="text-right font-mono">{Number(t.qty)}</td>
                      <td className="text-right font-mono">{Number(t.price).toFixed(4)}</td>
                      <td className="text-xs">{t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Recent signals</div>
          {!activity?.signals.length ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No signals yet.</div>
          ) : (
            <ul className="space-y-2">
              {activity.signals.slice(0, 12).map((s) => (
                <li key={s.id} className="flex items-start gap-2 text-xs">
                  <Badge variant={s.kind === "buy" ? "default" : s.kind === "sell" ? "destructive" : "secondary"} className="text-[10px] uppercase">
                    {s.kind}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-foreground">{s.reason}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {new Date(s.ts).toLocaleString()} · {s.price ? Number(s.price).toFixed(4) : "—"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <BacktestDialog open={backtestOpen} onOpenChange={setBacktestOpen} botId={botId} />
    </>
  );
}

function PriceChart({ candles, error }: { candles: Array<{ time: number; open: number; high: number; low: number; close: number }>; error: string | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "rgba(255,255,255,0.6)" },
      grid: { vertLines: { color: "rgba(255,255,255,0.05)" }, horzLines: { color: "rgba(255,255,255,0.05)" } },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderVisible: false },
    });
    chartRef.current = chart;
    return () => { chart.remove(); chartRef.current = null; };
  }, []);

  useEffect(() => {
    if (!chartRef.current || candles.length === 0) return;
    const series = chartRef.current.addSeries(CandlestickSeries, {
      upColor: "#22c55e", downColor: "#ef4444", borderVisible: false,
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    });
    series.setData(candles.map((c) => ({ time: c.time as never, open: c.open, high: c.high, low: c.low, close: c.close })));
    chartRef.current.timeScale().fitContent();
    return () => { try { chartRef.current?.removeSeries(series); } catch { /* ignore */ } };
  }, [candles]);

  return (
    <div className="relative h-[360px] w-full">
      <div ref={ref} className="h-full w-full" />
      {error && <div className="absolute inset-0 grid place-items-center text-xs text-destructive">{error}</div>}
      {!error && candles.length === 0 && (
        <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
        </div>
      )}
    </div>
  );
}

function EquityChart({ points }: { points: Array<{ equity: number; ts: string }> }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "rgba(255,255,255,0.6)" },
      grid: { vertLines: { color: "rgba(255,255,255,0.05)" }, horzLines: { color: "rgba(255,255,255,0.05)" } },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderVisible: false },
    });
    const series = chart.addSeries(LineSeries, { color: "#3b82f6", lineWidth: 2 });
    if (points.length) {
      series.setData(
        points.map((p) => ({ time: Math.floor(new Date(p.ts).getTime() / 1000) as never, value: Number(p.equity) })),
      );
      chart.timeScale().fitContent();
    }
    return () => chart.remove();
  }, [points]);
  return (
    <div className="relative h-[360px] w-full">
      <div ref={ref} className="h-full w-full" />
      {points.length === 0 && (
        <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">No equity data yet</div>
      )}
    </div>
  );
}

function BacktestDialog({ open, onOpenChange, botId }: { open: boolean; onOpenChange: (v: boolean) => void; botId: string }) {
  const run = useServerFn(runBacktest);
  const [limit, setLimit] = useState(300);
  const [feeBps, setFeeBps] = useState(10);
  const mut = useMutation({
    mutationFn: () => run({ data: { id: botId, limit, fee_bps: feeBps } }),
    onError: (e: Error) => toast.error(e.message),
  });
  const result = mut.data;
  const fmt = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) mut.reset(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Backtest strategy</DialogTitle>
          <DialogDescription>
            Replay this bot's strategy over recent historical candles. No live orders are placed.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bt-limit">Candles</Label>
            <Input id="bt-limit" type="number" min={50} max={500} value={limit}
              onChange={(e) => setLimit(Math.max(50, Math.min(500, Number(e.target.value) || 0)))}
              className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bt-fee">Fee (bps)</Label>
            <Input id="bt-fee" type="number" min={0} max={100} value={feeBps}
              onChange={(e) => setFeeBps(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              className="font-mono" />
            <p className="text-xs text-muted-foreground">10 bps = 0.10% per fill.</p>
          </div>
        </div>

        {result && (result.ok ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Net P&L" value={fmt(result.total)} tone={result.total >= 0 ? "up" : "down"} />
              <Stat label="Trades" value={String(result.trades_count)} />
              <Stat label="Win rate" value={result.wins + result.losses > 0 ? `${(result.win_rate * 100).toFixed(0)}%` : "—"} />
              <Stat label="Max DD" value={fmt(result.max_drawdown)} tone="down" />
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {new Date(result.from * 1000).toLocaleString()} → {new Date(result.to * 1000).toLocaleString()} · {result.candles_used} candles
            </div>
            {result.trades.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded border border-border/40">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/60 text-left font-mono uppercase text-muted-foreground">
                    <tr><th className="px-2 py-1">Time</th><th>Side</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">PnL</th></tr>
                  </thead>
                  <tbody>
                    {result.trades.slice().reverse().map((t, i) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="px-2 py-1 font-mono">{new Date(t.time * 1000).toLocaleString()}</td>
                        <td><Badge variant={t.side === "buy" ? "default" : "destructive"} className="text-[10px] uppercase">{t.side}</Badge></td>
                        <td className="text-right font-mono">{t.qty.toFixed(4)}</td>
                        <td className="text-right font-mono">{t.price.toFixed(4)}</td>
                        <td className={`text-right font-mono ${t.pnl > 0 ? "text-emerald-400" : t.pnl < 0 ? "text-destructive" : ""}`}>
                          {t.pnl ? fmt(t.pnl) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{result.error}</div>
        ))}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Run backtest
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded border border-border/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-mono text-lg ${tone === "up" ? "text-emerald-400" : tone === "down" ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}