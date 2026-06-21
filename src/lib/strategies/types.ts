// Client-safe strategy registry. Used by both UI (to render forms) and
// server-side strategy engine (to validate params on save).

export type StrategyKind = "sma_crossover" | "rsi_reversion" | "grid" | "dca";

export type ParamType = "int" | "number" | "string";

export interface ParamSpec {
  key: string;
  label: string;
  type: ParamType;
  default: number | string;
  min?: number;
  max?: number;
  step?: number;
  help?: string;
}

export interface StrategySpec {
  kind: StrategyKind;
  label: string;
  description: string;
  params: ParamSpec[];
}

export const STRATEGIES: Record<StrategyKind, StrategySpec> = {
  sma_crossover: {
    kind: "sma_crossover",
    label: "SMA Crossover",
    description: "Buy when fast SMA crosses above slow SMA, sell on cross down.",
    params: [
      { key: "fast", label: "Fast period", type: "int", default: 9, min: 2, max: 200 },
      { key: "slow", label: "Slow period", type: "int", default: 21, min: 3, max: 500 },
      { key: "order_qty", label: "Order quantity", type: "number", default: 0.001, min: 0, step: 0.0001, help: "Base asset units per signal." },
    ],
  },
  rsi_reversion: {
    kind: "rsi_reversion",
    label: "RSI Mean Reversion",
    description: "Buy when RSI < oversold, sell when RSI > overbought.",
    params: [
      { key: "period", label: "RSI period", type: "int", default: 14, min: 2, max: 100 },
      { key: "oversold", label: "Oversold level", type: "number", default: 30, min: 0, max: 100 },
      { key: "overbought", label: "Overbought level", type: "number", default: 70, min: 0, max: 100 },
      { key: "order_qty", label: "Order quantity", type: "number", default: 0.001, min: 0, step: 0.0001 },
    ],
  },
  grid: {
    kind: "grid",
    label: "Grid Bot",
    description: "Place staggered buy/sell orders between a lower and upper bound.",
    params: [
      { key: "lower_price", label: "Lower price", type: "number", default: 0, min: 0, step: 0.01 },
      { key: "upper_price", label: "Upper price", type: "number", default: 0, min: 0, step: 0.01 },
      { key: "levels", label: "Grid levels", type: "int", default: 10, min: 2, max: 100 },
      { key: "order_qty", label: "Qty per level", type: "number", default: 0.001, min: 0, step: 0.0001 },
    ],
  },
  dca: {
    kind: "dca",
    label: "DCA",
    description: "Buy a fixed quote-amount on a fixed interval.",
    params: [
      { key: "interval_minutes", label: "Interval (min)", type: "int", default: 60, min: 1, max: 10080 },
      { key: "quote_amount", label: "Quote amount", type: "number", default: 10, min: 0, step: 0.01, help: "Spent each interval (e.g. USDT)." },
    ],
  },
};

export const STRATEGY_LIST: StrategySpec[] = Object.values(STRATEGIES);

export const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type Timeframe = (typeof TIMEFRAMES)[number];

export function defaultParamsFor(kind: StrategyKind): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const p of STRATEGIES[kind].params) out[p.key] = p.default;
  return out;
}

export function validateParams(kind: StrategyKind, raw: Record<string, unknown>): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  for (const p of STRATEGIES[kind].params) {
    const v = raw[p.key];
    if (p.type === "string") {
      out[p.key] = String(v ?? p.default);
      continue;
    }
    let n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) n = Number(p.default);
    if (p.type === "int") n = Math.round(n);
    if (p.min !== undefined && n < p.min) throw new Error(`${p.label} must be >= ${p.min}`);
    if (p.max !== undefined && n > p.max) throw new Error(`${p.label} must be <= ${p.max}`);
    out[p.key] = n;
  }
  return out;
}