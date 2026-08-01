import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, CheckCircle2, AlertTriangle, Loader2, ShieldAlert, ExternalLink, HelpCircle, ChevronDown, Sparkles } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listExchangeAccounts,
  createExchangeAccount,
  deleteExchangeAccount,
  testExchangeConnection,
} from "@/lib/exchanges.functions";
import { EXCHANGES, EXCHANGE_LIST, type ExchangeKind, type ExchangeMode } from "@/lib/exchanges/types";

export const Route = createFileRoute("/_authenticated/exchanges")({
  head: () => ({ meta: [{ title: "Exchanges — Tradedesk" }] }),
  component: ExchangesPage,
});

function ExchangesPage() {
  const list = useServerFn(listExchangeAccounts);
  const remove = useServerFn(deleteExchangeAccount);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["exchange_accounts"],
    queryFn: () => list(),
  });

  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Connection removed");
      qc.invalidateQueries({ queryKey: ["exchange_accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Exchanges"
        description="Connect Binance, Coinbase, or Alpaca. Testnet/sandbox/paper modes recommended."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Connect exchange
          </Button>
        }
      />
      <div className="space-y-4 p-8">
        {isLoading ? (
          <Card className="grid place-items-center p-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </Card>
        ) : accounts.length === 0 ? (
          <Card className="grid place-items-center p-16 text-center">
            <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              No connections yet
            </div>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Add an exchange API key to enable bots. We verify the key before saving and store it encrypted.
            </p>
            <Button className="mt-4" onClick={() => setOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Connect exchange
            </Button>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {accounts.map((a) => {
              const meta = EXCHANGES[a.exchange as ExchangeKind];
              const isLive = a.mode === "live";
              return (
                <Card key={a.id} className="flex flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{a.label}</div>
                      <div className="text-xs text-muted-foreground">{meta?.label ?? a.exchange}</div>
                    </div>
                    <Badge variant={isLive ? "destructive" : "secondary"} className="font-mono text-[10px] uppercase">
                      {isLive ? meta?.liveLabel ?? "Live" : meta?.demoLabel ?? "Demo"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[color:var(--color-long,theme(colors.emerald.500))]" />
                    Verified {a.last_verified_at ? new Date(a.last_verified_at).toLocaleString() : "—"}
                  </div>
                  <div className="mt-auto flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Remove "${a.label}"? Bots using it will stop.`)) del.mutate(a.id);
                      }}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <ConnectDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function ConnectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const test = useServerFn(testExchangeConnection);
  const create = useServerFn(createExchangeAccount);

  const [exchange, setExchange] = useState<ExchangeKind>("binance");
  const [mode, setMode] = useState<ExchangeMode>("demo");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const meta = EXCHANGES[exchange];

  function reset() {
    setExchange("binance");
    setMode("demo");
    setLabel("");
    setApiKey("");
    setApiSecret("");
    setPassphrase("");
  }

  const testMut = useMutation({
    mutationFn: () =>
      test({ data: { exchange, mode, apiKey, apiSecret, passphrase: passphrase || undefined } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Connected · ${r.info}`);
      else toast.error(r.error);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      create({
        data: { exchange, mode, label: label.trim(), apiKey, apiSecret, passphrase: passphrase || undefined },
      }),
    onSuccess: () => {
      toast.success("Exchange connected");
      qc.invalidateQueries({ queryKey: ["exchange_accounts"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disabled =
    !label.trim() ||
    !apiKey.trim() ||
    !apiSecret.trim() ||
    (meta.requiresPassphrase && !passphrase.trim());

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect exchange</DialogTitle>
          <DialogDescription>
            Keys are verified, then encrypted at rest. We never expose them to the browser.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Exchange</Label>
              <Select value={exchange} onValueChange={(v) => setExchange(v as ExchangeKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXCHANGE_LIST.map((e) => (
                    <SelectItem key={e.kind} value={e.kind}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as ExchangeMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="demo">{meta.demoLabel} (recommended)</SelectItem>
                  <SelectItem value="live">{meta.liveLabel} — real money</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {mode === "live" && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold uppercase tracking-wide">Live trading</div>
                Orders will use real funds. Restrict your API key to spot trading and disable withdrawals.
              </div>
            </div>
          )}

          <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
            {meta.keysHelp}{" "}
            <a href={meta.docsUrl} target="_blank" rel="noreferrer" className="underline">Docs</a>
          </div>

          <BeginnerGuide meta={meta} mode={mode} />

          <div className="space-y-1.5">
            <Label htmlFor="label">Label</Label>
            <Input id="label" placeholder="e.g. Binance Testnet" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="apiKey">API key</Label>
            <Input id="apiKey" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="apiSecret">API secret</Label>
            <Input id="apiSecret" type="password" autoComplete="off" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} />
          </div>
          {meta.requiresPassphrase && (
            <div className="space-y-1.5">
              <Label htmlFor="passphrase">Passphrase</Label>
              <Input id="passphrase" type="password" autoComplete="off" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            type="button"
            disabled={disabled || testMut.isPending}
            onClick={() => testMut.mutate()}
          >
            {testMut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
            Test connection
          </Button>
          <Button
            type="button"
            disabled={disabled || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-1.5 h-4 w-4 opacity-0" />}
            Verify & save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BeginnerGuide({
  meta,
  mode,
}: {
  meta: (typeof EXCHANGES)[ExchangeKind];
  mode: ExchangeMode;
}) {
  const [openGuide, setOpenGuide] = useState(true);
  const [openHelp, setOpenHelp] = useState(false);
  const steps = meta.setupSteps[mode];

  return (
    <div className="rounded-md border border-primary/25 bg-primary/5">
      <button
        type="button"
        onClick={() => setOpenGuide((v) => !v)}
        className="flex w-full items-center gap-2 p-3 text-left"
        aria-expanded={openGuide}
      >
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <span className="font-mono text-[11px] uppercase tracking-wider">
          New here? Get {meta.label} {mode === "demo" ? meta.demoLabel : meta.liveLabel} keys
        </span>
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${openGuide ? "rotate-180" : ""}`} />
      </button>

      {openGuide && (
        <div className="space-y-3 border-t border-primary/20 p-3 pt-3">
          <ol className="space-y-2 text-xs text-muted-foreground">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-px grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary/15 font-mono text-[10px] text-primary">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{s}</span>
              </li>
            ))}
          </ol>

          <a
            href={meta.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            Open {meta.label} key page <ExternalLink className="h-3 w-3" />
          </a>

          <div className="rounded-md border border-border/60 bg-background/40 p-2.5 text-[11px] text-muted-foreground">
            Tip: start with <strong className="text-foreground">{meta.demoLabel}</strong>. It uses fake money, so a
            wrong key or a bad strategy costs you nothing.
          </div>

          <div>
            <button
              type="button"
              onClick={() => setOpenHelp((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              aria-expanded={openHelp}
            >
              <HelpCircle className="h-3.5 w-3.5" /> Something went wrong?
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openHelp ? "rotate-180" : ""}`} />
            </button>
            {openHelp && (
              <ul className="mt-2 space-y-2">
                {meta.troubleshooting.map((t) => (
                  <li key={t.problem} className="text-[11px] leading-relaxed text-muted-foreground">
                    <span className="font-mono text-foreground">{t.problem}</span> — {t.fix}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}