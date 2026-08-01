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
  /** Beginner step-by-step to create API keys (per mode). */
  setupSteps: Record<ExchangeMode, string[]>;
  /** Common mistakes → what to do. */
  troubleshooting: { problem: string; fix: string }[];
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
    setupSteps: {
      demo: [
        "Open testnet.binance.vision and click \"Log in with GitHub\" (free, no ID check, fake money).",
        "Click \"Generate HMAC_SHA256 Key\", give it any name, then Generate.",
        "Copy the API Key and the Secret Key immediately — the secret is shown only once.",
        "Paste both below, keep Mode = Testnet, then press \"Test connection\".",
      ],
      live: [
        "Log in to binance.com → Profile icon → Account → API Management.",
        "Click \"Create API\" → choose \"System generated\" → name it \"Tradedesk\" → confirm with email/2FA.",
        "In \"Edit restrictions\" tick ONLY \"Enable Reading\" and \"Enable Spot & Margin Trading\". Leave withdrawals OFF.",
        "Under IP access restriction choose \"Unrestricted\" (or whitelist fails with error -2015).",
        "Copy the API Key + Secret Key and paste them below, then press \"Test connection\".",
      ],
    },
    troubleshooting: [
      { problem: "Error -2015 (Invalid API-key, IP, or permissions)", fix: "Your key has an IP whitelist, is missing Spot Trading permission, or you're using a live key with Mode = Testnet (and vice-versa)." },
      { problem: "Signature / -1022 error", fix: "The secret was copied with a space or is incomplete. Re-copy it, or generate a new key." },
      { problem: "Can't see the secret anymore", fix: "Binance shows it once. Delete the key and create a new one." },
    ],
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
    setupSteps: {
      demo: [
        "Go to public.sandbox.exchange.coinbase.com and create a free sandbox account.",
        "Open Profile → API → New API Key, tick \"View\" and \"Trade\".",
        "Save the Key, Secret and Passphrase shown on screen.",
        "Paste all three below with Mode = Sandbox and press \"Test connection\".",
      ],
      live: [
        "Log in to exchange.coinbase.com → Profile → API → New API Key.",
        "Select the portfolio, tick \"View\" and \"Trade\" only — never \"Transfer\".",
        "Set your own passphrase, confirm with 2FA, then copy Key + Secret + Passphrase.",
        "Paste all three below and press \"Test connection\".",
      ],
    },
    troubleshooting: [
      { problem: "Invalid Passphrase", fix: "The passphrase is the one you typed when creating the key — not your account password." },
      { problem: "Invalid API Key", fix: "Coinbase Exchange keys are different from Coinbase.com / CDP keys. Create them at exchange.coinbase.com." },
    ],
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
    setupSteps: {
      demo: [
        "Sign up free at alpaca.markets — no funding or ID needed for paper trading.",
        "In the dashboard switch the toggle to \"Paper Trading\".",
        "On the right panel click \"Generate New Key\".",
        "Copy the Key ID and Secret Key, paste below with Mode = Paper, then \"Test connection\".",
      ],
      live: [
        "Complete Alpaca account approval and fund it.",
        "Switch the dashboard toggle to \"Live Trading\".",
        "Click \"Generate New Key\" and copy the Key ID + Secret Key.",
        "Paste below with Mode = Live and press \"Test connection\".",
      ],
    },
    troubleshooting: [
      { problem: "403 forbidden", fix: "You're using paper keys in Live mode (or the reverse). Keys are not shared between them." },
    ],
  },
};

export const EXCHANGE_LIST: ExchangeMeta[] = Object.values(EXCHANGES);