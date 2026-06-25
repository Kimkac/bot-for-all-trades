import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ArrowRight, Bot, GitBranch, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tradedesk — multi-exchange trading bots" },
      { name: "description", content: "Run configurable trading bots on Binance, Coinbase, and Alpaca — live or demo — from one terminal." },
      { property: "og:title", content: "Tradedesk — multi-exchange trading bots" },
      { property: "og:description", content: "Configurable strategies. Live or paper. One dashboard for every exchange." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <Activity className="h-4 w-4" />
            </span>
            Tradedesk
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/auth" className="rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground">Sign in</Link>
            <Button asChild size="sm"><Link to="/auth">Get started</Link></Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-24 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/50 px-3 py-1 text-xs font-mono uppercase tracking-wider text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            Live + Demo trading
          </span>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight md:text-6xl">
            One terminal.<br />
            <span className="text-primary">Every exchange.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground">
            Connect Binance, Coinbase, or Alpaca — live or paper — and run configurable
            strategies from a single dashboard. Bring your own keys. Your data stays yours.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg"><Link to="/auth">Launch terminal <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          </div>

          {/* Mock terminal preview */}
          <div className="mx-auto mt-16 w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center gap-2 border-b border-border bg-background/60 px-4 py-2">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-short/70" />
                <div className="h-2.5 w-2.5 rounded-full bg-warning/70" />
                <div className="h-2.5 w-2.5 rounded-full bg-long/70" />
              </div>
              <span className="ml-2 font-mono text-xs text-muted-foreground">tradedesk · BTC/USDT · 1m</span>
            </div>
            <div className="grid gap-px bg-border/40 sm:grid-cols-3">
              {[
                { label: "Equity", value: "$24,812.40", change: "+2.14%", positive: true },
                { label: "Open P&L", value: "+$312.07", change: "BTC long", positive: true },
                { label: "Active bots", value: "3", change: "1 paused", positive: false },
              ].map((s) => (
                <div key={s.label} className="bg-card px-5 py-4 text-left">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</div>
                  <div className="mt-1 font-mono text-2xl">{s.value}</div>
                  <div className={`mt-0.5 font-mono text-xs ${s.positive ? "text-long" : "text-muted-foreground"}`}>{s.change}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-border/60 py-20">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 md:grid-cols-3">
          {[
            { icon: GitBranch, title: "Pluggable exchanges", body: "Binance, Coinbase Advanced, and Alpaca out of the box. Add more with one adapter file." },
            { icon: Bot, title: "Configurable strategies", body: "SMA crossover, RSI mean-reversion, grid, and DCA — tune every parameter from the UI." },
            { icon: ShieldCheck, title: "Keys encrypted at rest", body: "API credentials never leave the server unencrypted. Start in demo mode, flip to live when ready." },
          ].map((f) => (
            <div key={f.title} className="rounded-lg border border-border bg-card p-6">
              <f.icon className="h-5 w-5 text-primary" />
              <h2 className="mt-4 text-base font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="py-10 text-center text-xs text-muted-foreground">
        <Zap className="mx-auto mb-2 h-3.5 w-3.5" />
        Trading involves risk. Test in demo mode before going live.
      </footer>
    </div>
  );
}
