import { createHmac } from "node:crypto";
import { EXCHANGES, type Balance, type ExchangeCredentials, type ExchangeKind, type ExchangeMode } from "./types";

export interface ExchangeAdapter {
  testConnection(): Promise<{ ok: true; info?: string }>;
  getBalances(): Promise<Balance[]>;
}

function baseUrl(kind: ExchangeKind, mode: ExchangeMode): string {
  const meta = EXCHANGES[kind];
  return mode === "live" ? meta.liveBase : meta.demoBase;
}

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