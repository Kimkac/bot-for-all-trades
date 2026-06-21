// Client-safe types and metadata shared between adapters and UI.

export type ExchangeKind = "binance" | "coinbase" | "alpaca";
export type ExchangeMode = "live" | "demo";

export interface Balance {
  asset: string;
  free: number;
  total: number;
}

export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

export interface ExchangeMeta {
  kind: ExchangeKind;
  label: string;
  description: string;
  liveBase: string;
  demoBase: string;
  demoLabel: string;
  liveLabel: string;
  requiresPassphrase: boolean;
  docsUrl: string;
  keysHelp: string;
}

export const EXCHANGES: Record<ExchangeKind, ExchangeMeta> = {
  binance: {
    kind: "binance",
    label: "Binance",
    description: "Spot crypto trading",
    liveBase: "https://api.binance.com",
    demoBase: "https://testnet.binance.vision",
    demoLabel: "Testnet",
    liveLabel: "Live",
    requiresPassphrase: false,
    docsUrl: "https://testnet.binance.vision",
    keysHelp: "Create API keys with read + spot trading permissions. Use Testnet for demo.",
  },
  coinbase: {
    kind: "coinbase",
    label: "Coinbase Exchange",
    description: "Spot crypto via Coinbase Exchange API",
    liveBase: "https://api.exchange.coinbase.com",
    demoBase: "https://api-public.sandbox.exchange.coinbase.com",
    demoLabel: "Sandbox",
    liveLabel: "Live",
    requiresPassphrase: true,
    docsUrl: "https://docs.cdp.coinbase.com/exchange/docs/welcome",
    keysHelp: "Use Coinbase Exchange API keys (key + secret + passphrase). HMAC-style.",
  },
  alpaca: {
    kind: "alpaca",
    label: "Alpaca",
    description: "US equities & crypto",
    liveBase: "https://api.alpaca.markets",
    demoBase: "https://paper-api.alpaca.markets",
    demoLabel: "Paper",
    liveLabel: "Live",
    requiresPassphrase: false,
    docsUrl: "https://alpaca.markets/docs",
    keysHelp: "Generate API keys from your Alpaca dashboard. Paper trading is free.",
  },
};

export const EXCHANGE_LIST: ExchangeMeta[] = Object.values(EXCHANGES);