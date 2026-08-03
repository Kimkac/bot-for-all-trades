import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plane, TrendingUp, Wallet, History, Zap, Clock } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getWallet,
  getRecentRounds,
  getMyBets,
  placeBet,
  cashoutBet,
  type AviatorRound,
  type AviatorBet,
} from "@/lib/aviator.functions";

export const Route = createFileRoute("/_authenticated/aviator")({
  head: () => ({ meta: [{ title: "Aviator — Tradedesk" }] }),
  component: AviatorGame,
});

type GamePhase = "waiting" | "flying" | "crashed";

const WAITING_MS = 5000;
const TICK_MS = 50;

function computeMultiplier(elapsedMs: number): number {
  // Exponential growth: starts at 1.00x, grows ~6% per second
  const seconds = elapsedMs / 1000;
  const m = Math.pow(1.0718, seconds);
  return Math.max(1, Math.floor(m * 100) / 100);
}

export default function AviatorGame() {
  const qc = useQueryClient();
  const fetchWallet = useServerFn(getWallet);
  const fetchRounds = useServerFn(getRecentRounds);
  const fetchBets = useServerFn(getMyBets);
  const placeBetFn = useServerFn(placeBet);
  const cashoutFn = useServerFn(cashoutBet);

  const { data: wallet, refetch: refetchWallet } = useQuery({
    queryKey: ["aviator-wallet"],
    queryFn: () => fetchWallet(),
  });
  const { data: rounds } = useQuery({
    queryKey: ["aviator-rounds"],
    queryFn: () => fetchRounds(),
    refetchInterval: 3000,
  });
  const { data: myBets } = useQuery({
    queryKey: ["aviator-my-bets"],
    queryFn: () => fetchBets(),
    refetchInterval: 5000,
  });

  const [phase, setPhase] = useState<GamePhase>("waiting");
  const [multiplier, setMultiplier] = useState(1);
  const [currentRound, setCurrentRound] = useState<AviatorRound | null>(null);
  const [waitTime, setWaitTime] = useState(WAITING_MS / 1000);

  // Bet form
  const [betAmount, setBetAmount] = useState("1.00");
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState(false);
  const [autoCashoutValue, setAutoCashoutValue] = useState("2.00");

  // Active bet tracking
  const [activeBet, setActiveBet] = useState<AviatorBet | null>(null);
  const [pendingBet, setPendingBet] = useState<{ amount: number; autoCashout: number | null } | null>(null);

  // History strip
  const [historyStrip, setHistoryStrip] = useState<number[]>([]);

  const animFrame = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const roundIdRef = useRef<string | null>(null);
  const crashPointRef = useRef<number>(0);

  // ─── Game loop ──────────────────────────────────────────
  const startRound = useCallback(async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch("/api/aviator-round", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: "create_round" }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { round?: AviatorRound };
      if (!data.round) return;

      setCurrentRound(data.round);
      setPhase("flying");
      setMultiplier(1);
      startTimeRef.current = performance.now();
      roundIdRef.current = data.round.id;
      crashPointRef.current = data.round.crash_point;

      // If we have a pending bet, place it now
      if (pendingBetRef.current) {
        const pb = pendingBetRef.current;
        pendingBetRef.current = null;
        try {
          const bet = await placeBetFn({
            data: { round_id: data.round.id, amount: pb.amount, auto_cashout: pb.autoCashout },
          });
          setActiveBet(bet);
          setPendingBet(null);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Failed to place bet");
          setPendingBet(null);
        }
      }
    } catch {
      // silently retry next cycle
    }
  }, [placeBetFn]);

  const crashRound = useCallback(async () => {
    setPhase("crashed");
    setMultiplier(crashPointRef.current);

    // Update history strip
    setHistoryStrip((prev) => [crashPointRef.current, ...prev].slice(0, 18));

    if (activeBet && activeBet.status === "active") {
      setActiveBet(null);
    }

    // Tell the server
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.access_token || !roundIdRef.current) return;
      await fetch("/api/aviator-round", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: "crash_round", round_id: roundIdRef.current }),
      });
    } catch {
      // non-critical
    }

    qc.invalidateQueries({ queryKey: ["aviator-wallet"] });
    qc.invalidateQueries({ queryKey: ["aviator-my-bets"] });
    qc.invalidateQueries({ queryKey: ["aviator-rounds"] });

    // Wait 3s then go to waiting phase
    setTimeout(() => {
      setPhase("waiting");
      setWaitTime(WAITING_MS / 1000);
      setCurrentRound(null);
      // After waiting period, start new round
      setTimeout(() => startRound(), WAITING_MS);
    }, 3000);
  }, [activeBet, qc]);

  // Animation loop during flying phase
  useEffect(() => {
    if (phase !== "flying") {
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
      return;
    }

    const tick = () => {
      const elapsed = performance.now() - startTimeRef.current;
      const m = computeMultiplier(elapsed);

      if (m >= crashPointRef.current) {
        setMultiplier(crashPointRef.current);
        crashRound();
        return;
      }

      setMultiplier(m);

      // Auto-cashout check
      if (
        activeBetRef.current &&
        activeBetRef.current.status === "active" &&
        autoCashoutRef.current !== null &&
        m >= autoCashoutRef.current
      ) {
        doCashout(m);
      }

      animFrame.current = requestAnimationFrame(tick);
    };

    animFrame.current = requestAnimationFrame(tick);
    return () => {
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
    };
  }, [phase, crashRound]);

  // Waiting countdown
  useEffect(() => {
    if (phase !== "waiting") return;
    if (waitTime <= 0) {
      startRound();
      return;
    }
    const t = setTimeout(() => setWaitTime((w) => Math.max(0, w - 0.1)), 100);
    return () => clearTimeout(t);
  }, [phase, waitTime, startRound]);

  // Initialize: sync history strip from recent rounds
  useEffect(() => {
    if (rounds && rounds.length > 0 && historyStrip.length === 0) {
      setHistoryStrip(rounds.map((r) => r.crash_point).slice(0, 18));
    }
  }, [rounds, historyStrip.length]);

  // Start first round on mount
  useEffect(() => {
    if (phase === "waiting" && !currentRound && waitTime === WAITING_MS / 1000) {
      const t = setTimeout(() => startRound(), WAITING_MS);
      return () => clearTimeout(t);
    }
  }, [phase, currentRound, waitTime, startRound]);

  // Refs to avoid stale closures in animation loop
  const activeBetRef = useRef<AviatorBet | null>(null);
  const autoCashoutRef = useRef<number | null>(null);
  const pendingBetRef = useRef<{ amount: number; autoCashout: number | null } | null>(null);
  useEffect(() => { activeBetRef.current = activeBet; }, [activeBet]);
  useEffect(() => {
    autoCashoutRef.current = autoCashoutEnabled ? parseFloat(autoCashoutValue) || null : null;
  }, [autoCashoutEnabled, autoCashoutValue]);
  useEffect(() => { pendingBetRef.current = pendingBet; }, [pendingBet]);

  const doCashout = useCallback(
    async (m: number) => {
      if (!activeBetRef.current) return;
      try {
        const result = await cashoutFn({
          data: { bet_id: activeBetRef.current.id, current_multiplier: m },
        });
        setActiveBet(null);
        toast.success(`Cashed out at ${m.toFixed(2)}x — won $${Number(result.payout).toFixed(2)}`);
        refetchWallet();
        qc.invalidateQueries({ queryKey: ["aviator-my-bets"] });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Cashout failed");
      }
    },
    [cashoutFn, refetchWallet, qc],
  );

  // ─── Bet actions ─────────────────────────────────────────
  const placeBetMut = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(betAmount);
      if (!amount || amount <= 0) throw new Error("Enter a valid bet amount");
      const balance = wallet?.balance ?? 0;
      if (amount > balance) throw new Error("Insufficient balance");

      const autoCashout = autoCashoutEnabled ? parseFloat(autoCashoutValue) || null : null;

      if (phase === "flying" && currentRound) {
        const bet = await placeBetFn({
          data: { round_id: currentRound.id, amount, auto_cashout: autoCashout },
        });
        setActiveBet(bet);
      } else if (phase === "waiting") {
        setPendingBet({ amount, autoCashout });
        toast.info("Bet queued for next round");
      } else {
        throw new Error("Cannot bet right now");
      }
    },
    onSuccess: () => {
      refetchWallet();
      toast.success("Bet placed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cashoutMut = useMutation({
    mutationFn: () => doCashout(multiplier),
  });

  // ─── Quick bet presets ───────────────────────────────────
  const quickAmounts = [1, 5, 10, 25, 50, 100];
  const balance = wallet?.balance ?? 0;
  const canBet = phase === "flying" || phase === "waiting";
  const hasActiveBet = !!activeBet;
  const potentialWin = hasActiveBet
    ? (Number(activeBet!.amount) * multiplier).toFixed(2)
    : "0.00";

  return (
    <>
      <PageHeader
        title="Aviator"
        description="Cash out before the plane flies away."
        actions={
          <Badge variant="outline" className="gap-1.5 font-mono text-sm">
            <Wallet className="h-3.5 w-3.5" />
            ${balance.toFixed(2)}
          </Badge>
        }
      />

      <div className="space-y-6 p-4 md:p-8">
        {/* ─── History strip ──────────────────────────────── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {historyStrip.length === 0 ? (
            <span className="text-xs text-muted-foreground">No rounds yet</span>
          ) : (
            historyStrip.map((cp, i) => (
              <Badge
                key={i}
                variant="outline"
                className={`shrink-0 font-mono text-xs ${
                  cp < 2
                    ? "border-red-500/30 bg-red-500/10 text-red-400"
                    : cp < 10
                      ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                }`}
              >
                {cp.toFixed(2)}x
              </Badge>
            ))
          )}
        </div>

        {/* ─── Game display ────────────────────────────────── */}
        <Card className="relative overflow-hidden border-border/60 bg-gradient-to-b from-zinc-950 to-zinc-900 p-0">
          <div className="relative h-[280px] w-full overflow-hidden md:h-[340px]">
            {/* Grid background */}
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />

            {/* Radial glow following phase */}
            <div
              className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
                phase === "flying" ? "opacity-100" : "opacity-30"
              }`}
              style={{
                background:
                  phase === "crashed"
                    ? "radial-gradient(ellipse at center, rgba(239,68,68,0.15), transparent 70%)"
                    : "radial-gradient(ellipse at center, rgba(59,130,246,0.12), transparent 70%)",
              }}
            />

            {/* Center content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              {phase === "waiting" && (
                <>
                  <Clock className="h-8 w-8 animate-pulse text-muted-foreground" />
                  <span className="font-mono text-sm text-muted-foreground">
                    Next round in {waitTime.toFixed(1)}s
                  </span>
                </>
              )}

              {phase === "flying" && (
                <>
                  <div
                    className="font-mono text-6xl font-bold tracking-tight transition-colors md:text-7xl"
                    style={{
                      color: multiplier < 2 ? "#60a5fa" : multiplier < 10 ? "#34d399" : "#fbbf24",
                      textShadow: `0 0 30px ${
                        multiplier < 2 ? "rgba(96,165,250,0.4)" : multiplier < 10 ? "rgba(52,211,153,0.4)" : "rgba(251,191,36,0.4)"
                      }`,
                    }}
                  >
                    {multiplier.toFixed(2)}x
                  </div>
                  <Plane
                    className="h-6 w-6 text-muted-foreground"
                    style={{
                      transform: `translateX(${Math.min(multiplier * 8, 200)}px) translateY(-${Math.min(multiplier * 4, 80)}px) rotate(-15deg)`,
                      transition: "transform 0.05s linear",
                    }}
                  />
                </>
              )}

              {phase === "crashed" && (
                <>
                  <div className="font-mono text-6xl font-bold text-red-500 md:text-7xl" style={{ textShadow: "0 0 30px rgba(239,68,68,0.4)" }}>
                    {crashPointRef.current.toFixed(2)}x
                  </div>
                  <span className="font-mono text-sm font-semibold uppercase tracking-widest text-red-500">
                    Flew Away!
                  </span>
                </>
              )}
            </div>

            {/* Bottom progress bar */}
            {phase === "flying" && (
              <div className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-blue-500 via-emerald-400 to-amber-400 transition-all" style={{ width: `${Math.min((multiplier / crashPointRef.current) * 100, 100)}%` }} />
            )}
          </div>
        </Card>

        {/* ─── Bet panel + side info ───────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Bet panel */}
          <Card className="p-5 lg:col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Place Your Bet</h3>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Amount input */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Bet Amount
                </Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={betAmount}
                      onChange={(e) => setBetAmount(e.target.value)}
                      disabled={hasActiveBet}
                      className="pl-7 font-mono"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={hasActiveBet}
                    onClick={() => setBetAmount((b) => (Math.max(0.01, parseFloat(b) / 2)).toFixed(2))}
                  >
                    ½
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={hasActiveBet}
                    onClick={() => setBetAmount((b) => (parseFloat(b) * 2).toFixed(2))}
                  >
                    2×
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {quickAmounts.map((a) => (
                    <Button
                      key={a}
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={hasActiveBet}
                      onClick={() => setBetAmount(a.toFixed(2))}
                      className="h-7 px-2.5 text-xs font-mono"
                    >
                      ${a}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Auto cashout */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Auto Cashout
                  </Label>
                  <Switch
                    checked={autoCashoutEnabled}
                    onCheckedChange={setAutoCashoutEnabled}
                    disabled={hasActiveBet}
                  />
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min="1.01"
                    value={autoCashoutValue}
                    onChange={(e) => setAutoCashoutValue(e.target.value)}
                    disabled={!autoCashoutEnabled || hasActiveBet}
                    className="font-mono pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">x</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Automatically cash out when the multiplier reaches this value.
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-5 flex gap-3">
              {!hasActiveBet ? (
                <Button
                  className="flex-1 h-12 text-base font-semibold"
                  disabled={!canBet || placeBetMut.isPending || pendingBet !== null}
                  onClick={() => placeBetMut.mutate()}
                >
                  {pendingBet
                    ? "Bet Queued…"
                    : phase === "flying"
                      ? "Bet"
                      : phase === "waiting"
                        ? "Bet (Next Round)"
                        : "Wait…"}
                </Button>
              ) : (
                <Button
                  className="flex-1 h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700"
                  disabled={phase !== "flying" || cashoutMut.isPending}
                  onClick={() => cashoutMut.mutate()}
                >
                  {cashoutMut.isPending ? "Cashing Out…" : `Cash Out $${potentialWin}`}
                </Button>
              )}
            </div>

            {hasActiveBet && (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                <span className="text-muted-foreground">
                  Bet: <span className="font-mono text-foreground">${Number(activeBet!.amount).toFixed(2)}</span>
                </span>
                <span className="text-muted-foreground">
                  Current win: <span className="font-mono font-semibold text-emerald-400">${potentialWin}</span>
                </span>
              </div>
            )}
          </Card>

          {/* My recent bets */}
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">My Bets</h3>
            </div>
            <div className="max-h-[300px] space-y-1.5 overflow-y-auto">
              {!myBets || myBets.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">No bets yet</p>
              ) : (
                myBets.slice(0, 15).map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2 text-xs"
                  >
                    <div>
                      <span className="font-mono text-foreground">${Number(b.amount).toFixed(2)}</span>
                      {b.cashout_multiplier && (
                        <span className="ml-1.5 font-mono text-muted-foreground">@ {Number(b.cashout_multiplier).toFixed(2)}x</span>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        b.status === "cashed_out"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : b.status === "lost"
                            ? "border-red-500/30 bg-red-500/10 text-red-400"
                            : "border-border text-muted-foreground"
                      }`}
                    >
                      {b.status === "cashed_out"
                        ? `+$${Number(b.payout).toFixed(2)}`
                        : b.status === "lost"
                          ? `-$${Number(b.amount).toFixed(2)}`
                          : "Active"}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* ─── Recent rounds table ─────────────────────────── */}
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Recent Rounds</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 text-left font-medium">Round</th>
                  <th className="py-2 text-right font-medium">Crash Point</th>
                  <th className="py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {!rounds || rounds.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-xs text-muted-foreground">
                      No rounds yet
                    </td>
                  </tr>
                ) : (
                  rounds.slice(0, 10).map((r) => (
                    <tr key={r.id} className="border-b border-border/30">
                      <td className="py-2 font-mono text-xs">#{r.round_number}</td>
                      <td className="py-2 text-right font-mono text-xs">
                        <span className={Number(r.crash_point) < 2 ? "text-red-400" : Number(r.crash_point) < 10 ? "text-blue-400" : "text-emerald-400"}>
                          {Number(r.crash_point).toFixed(2)}x
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <Badge variant="outline" className="text-[10px]">
                          {r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
