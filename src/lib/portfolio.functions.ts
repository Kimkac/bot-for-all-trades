import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ExchangeKind, ExchangeMode, Balance } from "./exchanges/types";

export interface AccountBalancesEntry {
  account_id: string;
  label: string;
  exchange: ExchangeKind;
  mode: ExchangeMode;
  ok: boolean;
  error?: string;
  balances: Balance[];
}

export interface BotPnL {
  id: string;
  name: string;
  symbol: string;
  status: string;
  realized: number;
  unrealized: number;
  total: number;
  position: number;
  trades: number;
  last_price: number;
  last_error: string | null;
  max_daily_loss: number;
  daily_loss: number;
  risk_breached: boolean;
}

export const getPortfolioOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { decryptSecret } = await import("./crypto.server");
    const { createAdapter } = await import("./exchanges/adapters.server");

    const [{ data: accounts }, { data: bots }, { data: trades }] = await Promise.all([
      context.supabase
        .from("exchange_accounts")
        .select("id, label, exchange, mode, api_key_enc, api_secret_enc, passphrase_enc"),
      context.supabase
        .from("bots")
        .select("id, name, symbol, status, max_daily_loss, last_error"),
      context.supabase
        .from("trades")
        .select("bot_id, side, qty, price, ts, status")
        .eq("status", "filled")
        .order("ts", { ascending: true }),
    ]);

    // Fetch balances per account in parallel; tolerate failures.
    const accountResults: AccountBalancesEntry[] = await Promise.all(
      (accounts ?? []).map(async (a): Promise<AccountBalancesEntry> => {
        try {
          const adapter = createAdapter(a.exchange as ExchangeKind, a.mode as ExchangeMode, {
            apiKey: decryptSecret(a.api_key_enc),
            apiSecret: decryptSecret(a.api_secret_enc),
            passphrase: a.passphrase_enc ? decryptSecret(a.passphrase_enc) : undefined,
          });
          const balances = await adapter.getBalances();
          return {
            account_id: a.id, label: a.label,
            exchange: a.exchange as ExchangeKind, mode: a.mode as ExchangeMode,
            ok: true, balances,
          };
        } catch (e) {
          return {
            account_id: a.id, label: a.label,
            exchange: a.exchange as ExchangeKind, mode: a.mode as ExchangeMode,
            ok: false, error: e instanceof Error ? e.message : "balance fetch failed",
            balances: [],
          };
        }
      }),
    );

    // Per-bot realized P&L from filled trades.
    const tradesByBot = new Map<string, Array<{ side: string; qty: number; price: number; ts: string }>>();
    for (const t of trades ?? []) {
      const arr = tradesByBot.get(t.bot_id) ?? [];
      arr.push({ side: t.side as string, qty: Number(t.qty), price: Number(t.price), ts: t.ts as string });
      tradesByBot.set(t.bot_id, arr);
    }

    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    let tradesToday = 0;

    const bot_pnl: BotPnL[] = (bots ?? []).map((b) => {
      const list = tradesByBot.get(b.id) ?? [];
      let position = 0;
      let costBasis = 0; // average cost of current position
      let realized = 0;
      let dailyRealized = 0;
      let lastPrice = 0;
      for (const t of list) {
        lastPrice = t.price;
        const isToday = new Date(t.ts) >= startOfDay;
        if (isToday) tradesToday += 1;
        if (t.side === "buy") {
          const newPos = position + t.qty;
          costBasis = newPos > 0 ? (costBasis * position + t.price * t.qty) / newPos : 0;
          position = newPos;
        } else if (t.side === "sell") {
          const qty = Math.min(t.qty, position);
          const pnl = (t.price - costBasis) * qty;
          realized += pnl;
          if (isToday) dailyRealized += pnl;
          position -= qty;
          if (position <= 0) { position = 0; costBasis = 0; }
        }
      }
      const unrealized = position > 0 && lastPrice > 0 ? (lastPrice - costBasis) * position : 0;
      const dailyLoss = Math.max(0, -dailyRealized);
      return {
        id: b.id, name: b.name, symbol: b.symbol, status: b.status as string,
        realized, unrealized, total: realized + unrealized, position,
        trades: list.length, last_price: lastPrice,
        last_error: b.last_error as string | null,
        max_daily_loss: Number(b.max_daily_loss ?? 0),
        daily_loss: dailyLoss,
        risk_breached: Number(b.max_daily_loss ?? 0) > 0 && dailyLoss >= Number(b.max_daily_loss),
      };
    });

    const totals = bot_pnl.reduce(
      (acc, b) => {
        acc.realized += b.realized; acc.unrealized += b.unrealized; acc.total += b.total;
        return acc;
      }, { realized: 0, unrealized: 0, total: 0 },
    );
    const activeBots = (bots ?? []).filter((b) => b.status === "running").length;
    const alerts = bot_pnl.filter((b) => b.risk_breached || b.last_error);

    return {
      accounts: accountResults,
      bots: bot_pnl,
      totals,
      active_bots: activeBots,
      total_bots: (bots ?? []).length,
      trades_today: tradesToday,
      alerts,
    };
  });
