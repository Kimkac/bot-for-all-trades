import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Play, Square, Trash2, Loader2, AlertTriangle, Bot as BotIcon } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { listExchangeAccounts } from "@/lib/exchanges.functions";
import { listBots, upsertBot, setBotStatus, deleteBot } from "@/lib/bots.functions";
import { STRATEGIES, STRATEGY_LIST, TIMEFRAMES, defaultParamsFor, type StrategyKind, type Timeframe } from "@/lib/strategies/types";
import { EXCHANGES } from "@/lib/exchanges/types";

export const Route = createFileRoute("/_authenticated/bots")({
  head: () => ({ meta: [{ title: "Bots — Tradedesk" }] }),
  component: BotsPage,
});

function BotsPage() {
  const fetchBots = useServerFn(listBots);
  const fetchAccounts = useServerFn(listExchangeAccounts);
  const setStatus = useServerFn(setBotStatus);
  const remove = useServerFn(deleteBot);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: bots = [], isLoading } = useQuery({
    queryKey: ["bots"],
    queryFn: () => fetchBots(),
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["exchange_accounts"],
    queryFn: () => fetchAccounts(),
  });

  const startStop = useMutation({
    mutationFn: (vars: { id: string; running: boolean }) => setStatus({ data: vars }),
    onSuccess: (_d, vars) => {
      toast.success(vars.running ? "Bot started" : "Bot stopped");
      qc.invalidateQueries({ queryKey: ["bots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Bot deleted"); qc.invalidateQueries({ queryKey: ["bots"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const noAccounts = accounts.length === 0;

  return (
    <>
      <PageHeader
        title="Bots"
        description="Configurable trading strategies. Tick engine runs every minute."
        actions={
          <Button disabled={noAccounts} onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New bot
          </Button>
        }
      />
      <div className="space-y-4 p-8">
        {noAccounts && (
          <Card className="flex items-start gap-3 border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
            <div>
              Connect an exchange first.{" "}
              <Link to="/exchanges" className="underline">Go to Exchanges →</Link>
            </div>
          </Card>
        )}

        {isLoading ? (
          <Card className="grid place-items-center p-16"><Loader2 className="h-5 w-5 animate-spin" /></Card>
        ) : bots.length === 0 ? (
          <Card className="grid place-items-center p-16 text-center">
            <BotIcon className="h-6 w-6 text-muted-foreground" />
            <div className="mt-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">No bots yet</div>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Create a bot, pick a strategy, tune parameters, then start it.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {bots.map((b) => {
              const strat = STRATEGIES[b.strategy as StrategyKind];
              const acct = Array.isArray(b.exchange_accounts) ? b.exchange_accounts[0] : b.exchange_accounts;
              const live = acct?.mode === "live";
              const running = b.status === "running";
              return (
                <Card key={b.id} className="flex flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{b.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {b.symbol} · {b.timeframe} · {strat?.label ?? b.strategy}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={running ? "default" : b.status === "error" ? "destructive" : "secondary"} className="text-[10px] uppercase">
                        {b.status}
                      </Badge>
                      {acct && (
                        <Badge variant={live ? "destructive" : "outline"} className="text-[10px] uppercase">
                          {acct.label} · {live ? "live" : "demo"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {b.last_error && (
                    <div className="rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                      {b.last_error}
                    </div>
                  )}
                  <div className="font-mono text-xs text-muted-foreground">
                    Last tick: {b.last_tick_at ? new Date(b.last_tick_at).toLocaleString() : "—"}
                  </div>
                  <div className="mt-auto flex items-center justify-end gap-1">
                    {running ? (
                      <Button size="sm" variant="outline" onClick={() => startStop.mutate({ id: b.id, running: false })}>
                        <Square className="mr-1.5 h-3.5 w-3.5" /> Stop
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => startStop.mutate({ id: b.id, running: true })}>
                        <Play className="mr-1.5 h-3.5 w-3.5" /> Start
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (confirm(`Delete bot "${b.name}"?`)) del.mutate(b.id);
                    }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <BotDialog
        open={open}
        onOpenChange={setOpen}
        accounts={accounts.map((a) => ({ id: a.id, label: a.label, exchange: a.exchange as keyof typeof EXCHANGES, mode: a.mode as "live" | "demo" }))}
      />
    </>
  );
}

interface AccountOpt { id: string; label: string; exchange: keyof typeof EXCHANGES; mode: "live" | "demo" }

function BotDialog({
  open, onOpenChange, accounts,
}: { open: boolean; onOpenChange: (v: boolean) => void; accounts: AccountOpt[] }) {
  const qc = useQueryClient();
  const save = useServerFn(upsertBot);

  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? "");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState<Timeframe>("1m");
  const [strategy, setStrategy] = useState<StrategyKind>("sma_crossover");
  const [params, setParams] = useState<Record<string, number | string>>(defaultParamsFor("sma_crossover"));
  const [maxPosition, setMaxPosition] = useState("0");
  const [maxDailyLoss, setMaxDailyLoss] = useState("0");

  const strat = STRATEGIES[strategy];
  const acct = useMemo(() => accounts.find((a) => a.id === accountId) ?? accounts[0], [accounts, accountId]);

  function reset() {
    setAccountId(accounts[0]?.id ?? "");
    setName(""); setSymbol("BTCUSDT"); setTimeframe("1m");
    setStrategy("sma_crossover");
    setParams(defaultParamsFor("sma_crossover"));
    setMaxPosition("0"); setMaxDailyLoss("0");
  }

  function onStrategyChange(k: StrategyKind) {
    setStrategy(k);
    setParams(defaultParamsFor(k));
  }

  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          account_id: accountId,
          name: name.trim(),
          symbol: symbol.trim(),
          timeframe,
          strategy,
          params,
          max_position: Number(maxPosition) || 0,
          max_daily_loss: Number(maxDailyLoss) || 0,
        },
      }),
    onSuccess: () => {
      toast.success("Bot saved");
      qc.invalidateQueries({ queryKey: ["bots"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disabled = !accountId || !name.trim() || !symbol.trim();

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New bot</DialogTitle>
          <DialogDescription>
            Strategy parameters validate on save. The bot stays stopped until you start it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Exchange account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label} — {EXCHANGES[a.exchange]?.label ?? a.exchange} ({a.mode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {acct?.mode === "live" && (
              <p className="text-xs text-destructive">Live account — orders will use real funds.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">Bot name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="BTC scalper" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="symbol">Symbol</Label>
            <Input id="symbol" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="BTCUSDT" className="font-mono" />
          </div>

          <div className="space-y-1.5">
            <Label>Timeframe</Label>
            <Select value={timeframe} onValueChange={(v) => setTimeframe(v as Timeframe)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEFRAMES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Strategy</Label>
            <Select value={strategy} onValueChange={(v) => onStrategyChange(v as StrategyKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STRATEGY_LIST.map((s) => <SelectItem key={s.kind} value={s.kind}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground sm:col-span-2">
            {strat.description}
          </div>

          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
            {strat.params.map((p) => (
              <div key={p.key} className="space-y-1.5">
                <Label htmlFor={`p-${p.key}`}>{p.label}</Label>
                <Input
                  id={`p-${p.key}`}
                  type={p.type === "string" ? "text" : "number"}
                  inputMode={p.type === "int" ? "numeric" : "decimal"}
                  step={p.step ?? (p.type === "int" ? 1 : "any")}
                  min={p.min}
                  max={p.max}
                  value={params[p.key] as number | string}
                  onChange={(e) =>
                    setParams((prev) => ({
                      ...prev,
                      [p.key]: p.type === "string" ? e.target.value : e.target.value === "" ? "" : Number(e.target.value),
                    }))
                  }
                  className="font-mono"
                />
                {p.help && <p className="text-xs text-muted-foreground">{p.help}</p>}
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="maxpos">Max position size</Label>
            <Input id="maxpos" type="number" step="any" min={0} value={maxPosition} onChange={(e) => setMaxPosition(e.target.value)} className="font-mono" />
            <p className="text-xs text-muted-foreground">0 = no cap. Base asset units.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxloss">Max daily loss</Label>
            <Input id="maxloss" type="number" step="any" min={0} value={maxDailyLoss} onChange={(e) => setMaxDailyLoss(e.target.value)} className="font-mono" />
            <p className="text-xs text-muted-foreground">0 = no cap. Quote currency.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={disabled || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save bot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}