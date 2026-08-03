import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle, Check, CheckCircle2, Copy, Loader2, Wallet as WalletIcon,
  ArrowDownToLine, History,
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  getWallet, getMyDeposits, createDeposit, checkDepositStatus,
  type AviatorDeposit,
} from "@/lib/aviator.functions";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({ meta: [{ title: "Wallet — Tradedesk" }] }),
  component: WalletPage,
});

const QUICK_AMOUNTS = [10, 25, 50, 100, 250, 500];

function WalletPage() {
  const qc = useQueryClient();
  const fetchWallet = useServerFn(getWallet);
  const fetchDeposits = useServerFn(getMyDeposits);
  const createDepositFn = useServerFn(createDeposit);
  const checkStatusFn = useServerFn(checkDepositStatus);

  const { data: wallet } = useQuery({
    queryKey: ["aviator-wallet"],
    queryFn: () => fetchWallet(),
    refetchInterval: 10_000,
  });
  const { data: deposits } = useQuery({
    queryKey: ["aviator-deposits"],
    queryFn: () => fetchDeposits(),
    refetchInterval: 15_000,
  });

  const [amount, setAmount] = useState("25");
  const [pendingDeposit, setPendingDeposit] = useState<{
    deposit_id: string;
    payment_id: string | null;
    pay_address: string | null;
    pay_amount: number | null;
    pay_currency: string;
  } | null>(null);

  const depositMut = useMutation({
    mutationFn: async () => {
      const amt = parseFloat(amount);
      if (!amt || amt <= 0) throw new Error("Enter a valid amount");
      return createDepositFn({ data: { amount: amt } });
    },
    onSuccess: (r) => {
      setPendingDeposit(r);
      toast.success("Deposit initiated — send crypto to the address below");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkMut = useMutation({
    mutationFn: (depositId: string) => checkStatusFn({ data: { deposit_id: depositId } }),
    onSuccess: (r) => {
      if (r.status === "confirmed") {
        toast.success(r.message);
        setPendingDeposit(null);
        qc.invalidateQueries({ queryKey: ["aviator-wallet"] });
        qc.invalidateQueries({ queryKey: ["aviator-deposits"] });
      } else {
        toast.info(r.message);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const balance = wallet?.balance ?? 0;

  function copy(v: string) {
    navigator.clipboard.writeText(v);
    toast.success("Copied");
  }

  return (
    <>
      <PageHeader
        title="Wallet"
        description="Deposit funds to play Aviator. Crypto payments via NOWPayments."
      />
      <div className="space-y-6 p-4 md:p-8">
        {/* Balance card */}
        <Card className="relative overflow-hidden border-border/60 bg-gradient-to-br from-zinc-950 to-zinc-900 p-6">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-blue-500/10 blur-[80px]" />
          <div className="relative flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <WalletIcon className="h-3.5 w-3.5" /> Available Balance
              </div>
              <div className="mt-2 font-mono text-5xl font-bold text-foreground">
                ${balance.toFixed(2)}
              </div>
            </div>
            <Button asChild variant="outline">
              <a href="/aviator"><ArrowDownToLine className="mr-1.5 h-4 w-4" /> Play</a>
            </Button>
          </div>
        </Card>

        {/* Deposit form */}
        <Card className="p-6">
          <h3 className="mb-1 text-sm font-semibold">Deposit</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            Pay with USDT (TRC20) via NOWPayments. Your balance is credited automatically once the payment is confirmed on-chain.
          </p>

          <div className="space-y-3">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Amount (USD)
              </Label>
              <div className="relative mt-1.5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">$</span>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-7 font-mono text-lg"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((a) => (
                <Button
                  key={a}
                  variant="secondary"
                  size="sm"
                  onClick={() => setAmount(String(a))}
                  className="font-mono"
                >
                  ${a}
                </Button>
              ))}
            </div>
            <Button
              className="w-full h-12 text-base font-semibold"
              disabled={depositMut.isPending}
              onClick={() => depositMut.mutate()}
            >
              {depositMut.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating Invoice…</>
              ) : (
                <>Deposit ${amount || "0"}</>
              )}
            </Button>
          </div>
        </Card>

        {/* Deposit history */}
        <Card className="p-6">
          <div className="mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Deposit History</h3>
          </div>
          {!deposits || deposits.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">No deposits yet</p>
          ) : (
            <div className="space-y-1.5">
              {deposits.map((d: AviatorDeposit) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2.5 text-sm"
                >
                  <div>
                    <span className="font-mono font-medium">${Number(d.amount_usd).toFixed(2)}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {new Date(d.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      d.status === "confirmed"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : d.status === "pending"
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                          : "border-red-500/30 bg-red-500/10 text-red-400"
                    }`}
                  >
                    {d.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Payment dialog */}
      <DepositDialog
        open={!!pendingDeposit}
        deposit={pendingDeposit}
        checking={checkMut.isPending}
        onCheck={() => pendingDeposit && checkMut.mutate(pendingDeposit.deposit_id)}
        onOpenChange={(v) => {
          if (!v) {
            setPendingDeposit(null);
            qc.invalidateQueries({ queryKey: ["aviator-deposits"] });
          }
        }}
        onCopy={copy}
      />
    </>
  );
}

function DepositDialog({
  open, deposit, checking, onCheck, onOpenChange, onCopy,
}: {
  open: boolean;
  deposit: {
    deposit_id: string;
    payment_id: string | null;
    pay_address: string | null;
    pay_amount: number | null;
    pay_currency: string;
  } | null;
  checking: boolean;
  onCheck: () => void;
  onOpenChange: (v: boolean) => void;
  onCopy: (v: string) => void;
}) {
  if (!deposit) return null;
  const address = deposit.pay_address ?? "";
  const amt = deposit.pay_amount ?? 0;
  const currency = (deposit.pay_currency ?? "usdttrc20").toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">
            <WalletIcon className="h-5 w-5" />
          </div>
          <DialogTitle>Complete your deposit</DialogTitle>
          <DialogDescription>
            Send exactly <span className="font-mono font-semibold text-foreground">{amt} {currency}</span> to the address below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="font-mono text-2xl">{amt} {currency}</span>
              <Button size="sm" variant="ghost" onClick={() => onCopy(String(amt))} aria-label="Copy amount">
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-xs text-muted-foreground">
              Send exactly <span className="font-mono text-foreground">{amt} USDT TRC20</span> to:
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-zinc-950 p-3 text-emerald-300">
              <span className="break-all font-mono text-sm">{address}</span>
              <Button size="sm" variant="ghost" className="text-emerald-300 hover:text-emerald-200" onClick={() => onCopy(address)} aria-label="Copy address">
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span><strong>Only send USDT TRC20.</strong> Wrong network = lost funds.</span>
          </div>

          <Button className="w-full" onClick={onCheck} disabled={checking || !deposit.payment_id}>
            {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            I've sent the payment
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
