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
function coinbaseAdapter(creds: ExchangeCredentials, mode: ExchangeMode): ExchangeAdapter {
  if (!creds.passphrase) throw new Error("Coinbase requires a passphrase");
  const base = baseUrl("coinbase", mode);
  async function signedGet(path: string) {
    const ts = Math.floor(Date.now() / 1000).toString();
    const prehash = ts + "GET" + path;
    const key = Buffer.from(creds.apiSecret, "base64");
    const sig = createHmac("sha256", key).update(prehash).digest("base64");
    const res = await fetch(`${base}${path}`, {
      headers: {
        "CB-ACCESS-KEY": creds.apiKey,
        "CB-ACCESS-SIGN": sig,
        "CB-ACCESS-TIMESTAMP": ts,
        "CB-ACCESS-PASSPHRASE": creds.passphrase!,
        "Content-Type": "application/json",
        "User-Agent": "tradedesk/1.0",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Coinbase ${res.status}: ${body.slice(0, 200)}`);
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
    async getCandles() { throw new Error("Coinbase tick engine not implemented yet"); },
    async getPrice() { throw new Error("Coinbase tick engine not implemented yet"); },
    async placeMarketOrder() { throw new Error("Coinbase tick engine not implemented yet"); },
  };
}

// ---------- Alpaca ----------
function alpacaAdapter(creds: ExchangeCredentials, mode: ExchangeMode): ExchangeAdapter {
  const base = baseUrl("alpaca", mode);
  async function get(path: string) {
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
  return {
    async testConnection() {
      const acc = await get("/v2/account");
      return { ok: true as const, info: `status=${acc.status}` };
    },
    async getBalances() {
      const acc = await get("/v2/account");
      const balances: Balance[] = [
        { asset: acc.currency ?? "USD", free: Number(acc.cash), total: Number(acc.equity) },
      ];
      try {
        const positions = await get("/v2/positions");
        for (const p of positions ?? []) {
          balances.push({ asset: p.symbol, free: Number(p.qty), total: Number(p.qty) });
        }
      } catch {
        // ignore
      }
      return balances;
    },
    async getCandles() { throw new Error("Alpaca tick engine not implemented yet"); },
    async getPrice() { throw new Error("Alpaca tick engine not implemented yet"); },
    async placeMarketOrder() { throw new Error("Alpaca tick engine not implemented yet"); },
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