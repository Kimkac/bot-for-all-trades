import { createHmac } from "node:crypto";
import { EXCHANGES, type Balance, type ExchangeCredentials, type ExchangeKind, type ExchangeMode } from "./types";

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type OrderSide = "buy" | "sell";

export interface OrderResult {
  orderId: string;
  filledQty: number;
  avgPrice: number;
  raw: unknown;
}

export interface ExchangeAdapter {
  testConnection(): Promise<{ ok: true; info?: string }>;
  getBalances(): Promise<Balance[]>;
  getCandles(symbol: string, timeframe: string, limit: number): Promise<Candle[]>;
  getPrice(symbol: string): Promise<number>;
  placeMarketOrder(symbol: string, side: OrderSide, qty: number): Promise<OrderResult>;
}

function baseUrl(kind: ExchangeKind, mode: ExchangeMode): string {
  const meta = EXCHANGES[kind];
  return mode === "live" ? meta.liveBase : meta.demoBase;
}

const BINANCE_INTERVALS: Record<string, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d",
};

// ---------- Binance Spot ----------
function binanceAdapter(creds: ExchangeCredentials, mode: ExchangeMode): ExchangeAdapter {
  const base = baseUrl("binance", mode);
  async function signedGet(path: string) {
    const ts = Date.now();
    const query = `timestamp=${ts}&recvWindow=10000`;
    const sig = createHmac("sha256", creds.apiSecret).update(query).digest("hex");
    const res = await fetch(`${base}${path}?${query}&signature=${sig}`, {
      headers: { "X-MBX-APIKEY": creds.apiKey },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Binance ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }
  async function publicGet(path: string) {
    const res = await fetch(`${base}${path}`);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Binance ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }
  async function signedPost(path: string, params: Record<string, string | number>) {
    const ts = Date.now();
    const merged: Record<string, string | number> = { ...params, timestamp: ts, recvWindow: 10000 };
    const query = Object.entries(merged).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
    const sig = createHmac("sha256", creds.apiSecret).update(query).digest("hex");
    const res = await fetch(`${base}${path}?${query}&signature=${sig}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": creds.apiKey },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Binance ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }
  return {
    async testConnection() {
      const acc = await signedGet("/api/v3/account");
      return { ok: true as const, info: `canTrade=${acc.canTrade}` };
    },
    async getBalances() {
      const acc = await signedGet("/api/v3/account");
      return (acc.balances ?? [])
        .map((b: { asset: string; free: string; locked: string }) => ({
          asset: b.asset,
          free: Number(b.free),
          total: Number(b.free) + Number(b.locked),
        }))
        .filter((b: Balance) => b.total > 0);
    },
    async getCandles(symbol, timeframe, limit) {
      const interval = BINANCE_INTERVALS[timeframe] ?? "1m";
      const rows = (await publicGet(
        `/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${Math.min(limit, 1000)}`,
      )) as unknown[][];
      return rows.map((r) => ({
        time: Math.floor(Number(r[0]) / 1000),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5]),
      }));
    },
    async getPrice(symbol) {
      const r = (await publicGet(`/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`)) as { price: string };
      return Number(r.price);
    },
    async placeMarketOrder(symbol, side, qty) {
      const r = await signedPost("/api/v3/order", {
        symbol,
        side: side.toUpperCase(),
        type: "MARKET",
        quantity: qty,
      });
      const fills = (r.fills ?? []) as Array<{ price: string; qty: string }>;
      const totalQty = fills.reduce((s, f) => s + Number(f.qty), 0) || Number(r.executedQty ?? qty);
      const totalCost = fills.reduce((s, f) => s + Number(f.qty) * Number(f.price), 0);
      const avg = totalQty > 0 && totalCost > 0 ? totalCost / totalQty : Number(r.price ?? 0);
      return { orderId: String(r.orderId), filledQty: totalQty, avgPrice: avg, raw: r };
    },
  };
}

// ---------- Coinbase Exchange (HMAC) ----------
const COINBASE_GRANULARITY: Record<string, number> = {
  "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400,
};

function coinbaseAdapter(creds: ExchangeCredentials, mode: ExchangeMode): ExchangeAdapter {
  if (!creds.passphrase) throw new Error("Coinbase requires a passphrase");
  const base = baseUrl("coinbase", mode);

  async function signedRequest(method: "GET" | "POST", path: string, body?: string) {
    const ts = Math.floor(Date.now() / 1000).toString();
    const prehash = ts + method + path + (body ?? "");
    const key = Buffer.from(creds.apiSecret, "base64");
    const sig = createHmac("sha256", key).update(prehash).digest("base64");
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "CB-ACCESS-KEY": creds.apiKey,
        "CB-ACCESS-SIGN": sig,
        "CB-ACCESS-TIMESTAMP": ts,
        "CB-ACCESS-PASSPHRASE": creds.passphrase!,
        "Content-Type": "application/json",
        "User-Agent": "tradedesk/1.0",
      },
      ...(body ? { body } : {}),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Coinbase ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }
  async function signedGet(path: string) {
    return signedRequest("GET", path);
  }
  async function signedPost(path: string, payload: Record<string, unknown>) {
    return signedRequest("POST", path, JSON.stringify(payload));
  }
  async function publicGet(path: string) {
    const res = await fetch(`${base}${path}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Coinbase ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  return {
    async testConnection() {
      const accounts = await signedGet("/accounts");
      return { ok: true as const, info: `${accounts.length} accounts` };
    },
    async getBalances() {
      const accounts = await signedGet("/accounts");
      return (accounts ?? [])
        .map((a: { currency: string; available: string; balance: string }) => ({
          asset: a.currency,
          free: Number(a.available),
          total: Number(a.balance),
        }))
        .filter((b: Balance) => b.total > 0);
    },
    async getCandles(symbol, timeframe, limit) {
      const granularity = COINBASE_GRANULARITY[timeframe] ?? 60;
      const end = Math.floor(Date.now() / 1000);
      const start = end - granularity * limit;
      const rows = (await publicGet(
        `/products/${encodeURIComponent(symbol)}/candles?granularity=${granularity}&start=${start}&end=${end}`,
      )) as Array<[number, number, number, number, number, number]>;
      // Coinbase returns newest-first; reverse for chronological order.
      return rows
        .slice()
        .reverse()
        .map((r) => ({
          time: Math.floor(r[0]),
          low: r[1],
          high: r[2],
          open: r[3],
          close: r[4],
          volume: r[5],
        }));
    },
    async getPrice(symbol) {
      const t = (await publicGet(`/products/${encodeURIComponent(symbol)}/ticker`)) as { price: string };
      return Number(t.price);
    },
    async placeMarketOrder(symbol, side, qty) {
      const r = await signedPost("/orders", {
        product_id: symbol,
        side,
        type: "market",
        size: qty.toFixed(8),
      });
      const orderId = String(r.id ?? "");
      let filledQty = 0;
      let avgPrice = 0;
      if (orderId) {
        try {
          const o = await signedGet(`/orders/${orderId}`);
          filledQty = Number(o.filled_size ?? 0);
          avgPrice = Number(o.executed_value ?? 0) / (filledQty || 1);
        } catch {
          // best-effort
        }
      }
      return { orderId, filledQty: filledQty || qty, avgPrice: avgPrice || 0, raw: r };
    },
  };
}

// ---------- Alpaca ----------
const ALPACA_TIMEFRAME: Record<string, string> = {
  "1m": "1Min", "5m": "5Min", "15m": "15Min", "1h": "1Hour", "4h": "4Hour", "1d": "1Day",
};

function alpacaAdapter(creds: ExchangeCredentials, mode: ExchangeMode): ExchangeAdapter {
  const base = baseUrl("alpaca", mode);
  // Market data lives on a separate host; paper/live share the same data API.
  const dataBase = "https://data.alpaca.markets";

  async function tradingGet(path: string) {
    const res = await fetch(`${base}${path}`, {
      headers: {
        "APCA-API-KEY-ID": creds.apiKey,
        "APCA-API-SECRET-KEY": creds.apiSecret,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Alpaca ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }
  async function tradingPost(path: string, payload: Record<string, unknown>) {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "APCA-API-KEY-ID": creds.apiKey,
        "APCA-API-SECRET-KEY": creds.apiSecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Alpaca ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }
  async function dataGet(path: string) {
    const res = await fetch(`${dataBase}${path}`, {
      headers: {
        "APCA-API-KEY-ID": creds.apiKey,
        "APCA-API-SECRET-KEY": creds.apiSecret,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Alpaca data ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  return {
    async testConnection() {
      const acc = await tradingGet("/v2/account");
      return { ok: true as const, info: `status=${acc.status}` };
    },
    async getBalances() {
      const acc = await tradingGet("/v2/account");
      const balances: Balance[] = [
        { asset: acc.currency ?? "USD", free: Number(acc.cash), total: Number(acc.equity) },
      ];
      try {
        const positions = await tradingGet("/v2/positions");
        for (const p of positions ?? []) {
          balances.push({ asset: p.symbol, free: Number(p.qty), total: Number(p.qty) });
        }
      } catch {
        // ignore
      }
      return balances;
    },
    async getCandles(symbol, timeframe, limit) {
      const tf = ALPACA_TIMEFRAME[timeframe] ?? "1Min";
      const end = new Date().toISOString();
      const start = new Date(Date.now() - limit * 60 * 1000).toISOString();
      const r = (await dataGet(
        `/v2/stocks/${encodeURIComponent(symbol)}/bars?timeframe=${tf}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&limit=${Math.min(limit, 1000)}`,
      )) as { bars: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }> };
      return (r.bars ?? []).map((b) => ({
        time: Math.floor(new Date(b.t).getTime() / 1000),
        open: b.o,
        high: b.h,
        low: b.l,
        close: b.c,
        volume: b.v,
      }));
    },
    async getPrice(symbol) {
      const r = (await dataGet(`/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest`)) as {
        quote: { ap: number; bp: number };
      };
      // Use bid for sells, ask for buys; mid is a reasonable reference.
      const ask = r.quote?.ap;
      const bid = r.quote?.bp;
      if (ask && bid) return (ask + bid) / 2;
      return ask || bid || 0;
    },
    async placeMarketOrder(symbol, side, qty) {
      const r = await tradingPost("/v2/orders", {
        symbol,
        side,
        type: "market",
        qty: qty.toFixed(6),
        time_in_force: "day",
      });
      const orderId = String(r.id ?? "");
      return {
        orderId,
        filledQty: Number(r.filled_qty ?? qty),
        avgPrice: Number(r.filled_avg_price ?? 0),
        raw: r,
      };
    },
  };
}

export function createAdapter(
  kind: ExchangeKind,
  mode: ExchangeMode,
  creds: ExchangeCredentials,
): ExchangeAdapter {
  switch (kind) {
    case "binance":
      return binanceAdapter(creds, mode);
    case "coinbase":
      return coinbaseAdapter(creds, mode);
    case "alpaca":
      return alpacaAdapter(creds, mode);
  }
}