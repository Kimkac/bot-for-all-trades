
# Multi-Exchange Trading Bot

A web app where you connect API keys for one or more exchanges (live or demo/testnet), configure bots with a strategy + parameters, and monitor positions, P&L, and charts from a dashboard.

## Scope of v1

**Supported exchanges (adapter pattern, easy to add more later):**
- Binance Spot — live + testnet
- Coinbase Advanced Trade — live + sandbox
- Alpaca — live + paper

Each adapter implements the same interface: `getBalances`, `getTicker`, `getCandles`, `placeOrder`, `cancelOrder`, `getOpenOrders`, `getPositions`. Adding Kraken / Bybit / OKX later = one new file.

**Strategies (configurable in UI):**
- SMA crossover (fast/slow periods)
- RSI mean reversion (period, oversold, overbought)
- Grid bot (upper, lower, grid count, order size)
- DCA (interval, amount)

Each strategy declares its parameter schema; the UI renders the form automatically.

**Dashboard:**
- Exchange Connections page — add/remove API keys per exchange, toggle live/demo, test connection
- Bots page — list of bots with status (running/stopped), start/stop, edit, delete, P&L
- Bot detail — candlestick chart with strategy markers (buy/sell signals), open positions, trade history, equity curve
- Portfolio overview — total balances across exchanges, aggregate P&L, recent trades feed

## Architecture

```text
Browser (React dashboard)
   │  TanStack Query + server functions
   ▼
TanStack Start server (Cloudflare Worker)
   │  - Exchange adapters (fetch-based, no SDKs)
   │  - Strategy engine
   │  - Auth middleware (requireSupabaseAuth)
   ▼
Lovable Cloud (Postgres)
   - exchange_accounts (encrypted keys)
   - bots (config + state)
   - trades, signals, equity_snapshots
   - user_roles
   ▼
pg_cron → /api/public/bot-tick (HMAC-signed)
   Every minute: load active bots → fetch candles → run strategy → place orders → log
```

**Why cron-driven instead of a long-running loop:** Cloudflare Workers don't run persistent processes. A 1-minute tick is enough for the strategies above (none are HFT). For sub-second strategies we'd need a different runtime — out of scope for v1.

## Security

- API keys encrypted at rest with `pgsodium` (or AES-GCM in a server function using a secret key). Never returned to the browser.
- All bot mutations require auth; RLS scopes rows by `user_id`.
- `/api/public/bot-tick` verified by HMAC of the body using `BOT_TICK_SECRET`.
- Big red "LIVE TRADING" badge + confirm dialog before starting a bot with live keys.
- Per-bot max position size and max daily loss as hard stops.

## Data model (Lovable Cloud)

```text
exchange_accounts (id, user_id, exchange, label, mode[live|demo],
                   api_key_enc, api_secret_enc, passphrase_enc, created_at)
bots              (id, user_id, account_id, name, symbol, timeframe,
                   strategy, params jsonb, status, max_position, max_daily_loss,
                   started_at, last_tick_at)
signals           (id, bot_id, ts, kind[buy|sell|hold], price, reason)
trades            (id, bot_id, ts, side, qty, price, fee, order_id, status)
equity_snapshots  (id, bot_id, ts, equity, pnl)
user_roles        (id, user_id, role)  -- standard pattern
```

All public tables get explicit GRANTs and RLS policies scoped to `auth.uid()`.

## Pages / routes

```text
/                       Marketing-ish landing → "Get started"
/auth                   Email + password
/_authenticated/
  dashboard             Portfolio overview
  exchanges             Connections CRUD
  exchanges/new
  bots                  List
  bots/new              Strategy + params form
  bots/$botId           Chart, trades, signals, controls
  settings              Account, danger zone
api/public/bot-tick     Cron endpoint (HMAC)
sitemap.xml, robots.txt
```

## Design direction

Dark, dense, "trading terminal" feel — think Bloomberg / TradingView / Linear. Mono numerals (JetBrains Mono) for prices, Inter for UI. Green/red semantic tokens for long/short. Candlestick chart via `lightweight-charts` (TradingView's own lib, MIT, works in browser).

## Build order

1. Lovable Cloud + auth + user_roles + design system
2. Schema + RLS + GRANTs + encryption helper
3. Exchange adapter interface + Binance adapter (testnet first)
4. Connections UI with "Test connection" button
5. Strategies (SMA, RSI, Grid, DCA) + engine
6. Bots CRUD + start/stop
7. Tick endpoint + pg_cron setup
8. Bot detail with chart, trades, signals
9. Portfolio dashboard
10. Coinbase + Alpaca adapters
11. Sitemap/robots, polish, README on how to add a new exchange

## Things I'm explicitly NOT doing in v1

- Sub-minute / tick-data strategies
- Futures / margin / options (spot only)
- Backtesting UI (engine could be reused later)
- Mobile push notifications
- Multi-user team accounts

## What I need from you before / during the build

- Confirm the exchange shortlist (Binance, Coinbase, Alpaca) — or swap one in/out
- API keys (testnet first, please) when we reach the connections step — added via secure secret prompts, never pasted into chat
- Confirmation before we wire live (non-demo) trading on

Reply "go" and I'll start with step 1 (Cloud + auth + design system). If you want to change the exchange list, strategies, or anything else above, tell me now.
