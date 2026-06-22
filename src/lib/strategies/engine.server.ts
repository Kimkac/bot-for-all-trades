import type { Candle } from "@/lib/exchanges/adapters.server";
import type { StrategyKind } from "./types";

export interface StrategyContext {
  candles: Candle[];
  position: number; // current base-asset position (signed)
  lastBuyTs: number | null; // unix seconds of most recent buy fill
  params: Record<string, number | string>;
}

export type SignalKind = "buy" | "sell" | "hold";

export interface StrategyDecision {
  signal: SignalKind;
  qty: number;
  price: number; // reference price (last close)
  reason: string;
}

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let s = 0;
  for (let i = values.length - period; i < values.length; i++) s += values[i];
  return s / period;
}

function rsi(values: number[], period: number): number | null {
  if (values.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  const avgG = gains / period;
  const avgL = losses / period;
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}

export function evaluate(kind: StrategyKind, ctx: StrategyContext): StrategyDecision {
  const closes = ctx.candles.map((c) => c.close);
  const price = closes[closes.length - 1] ?? 0;
  const hold = (reason: string): StrategyDecision => ({ signal: "hold", qty: 0, price, reason });
  const qty = Number(ctx.params.order_qty ?? 0);

  switch (kind) {
    case "sma_crossover": {
      const fast = Number(ctx.params.fast);
      const slow = Number(ctx.params.slow);
      if (closes.length < slow + 1) return hold(`need ${slow + 1} candles`);
      const prevF = sma(closes.slice(0, -1), fast)!;
      const prevS = sma(closes.slice(0, -1), slow)!;
      const curF = sma(closes, fast)!;
      const curS = sma(closes, slow)!;
      if (prevF <= prevS && curF > curS && ctx.position <= 0 && qty > 0)
        return { signal: "buy", qty, price, reason: `fast ${curF.toFixed(4)} ↑ slow ${curS.toFixed(4)}` };
      if (prevF >= prevS && curF < curS && ctx.position > 0)
        return { signal: "sell", qty: ctx.position, price, reason: `fast ${curF.toFixed(4)} ↓ slow ${curS.toFixed(4)}` };
      return hold(`fast ${curF.toFixed(4)} vs slow ${curS.toFixed(4)}`);
    }
    case "rsi_reversion": {
      const period = Number(ctx.params.period);
      const oversold = Number(ctx.params.oversold);
      const overbought = Number(ctx.params.overbought);
      const r = rsi(closes, period);
      if (r === null) return hold(`need ${period + 1} candles`);
      if (r < oversold && ctx.position <= 0 && qty > 0)
        return { signal: "buy", qty, price, reason: `RSI ${r.toFixed(1)} < ${oversold}` };
      if (r > overbought && ctx.position > 0)
        return { signal: "sell", qty: ctx.position, price, reason: `RSI ${r.toFixed(1)} > ${overbought}` };
      return hold(`RSI ${r.toFixed(1)}`);
    }
    case "grid": {
      const lo = Number(ctx.params.lower_price);
      const hi = Number(ctx.params.upper_price);
      const levels = Math.max(2, Number(ctx.params.levels));
      if (!(hi > lo) || qty <= 0) return hold("invalid bounds");
      if (price < lo || price > hi) return hold(`price ${price} outside [${lo}, ${hi}]`);
      const step = (hi - lo) / levels;
      // Target position = qty per level for each level whose price is at or above current price.
      const levelIndex = Math.floor((price - lo) / step);
      const targetPos = qty * (levels - levelIndex);
      const delta = targetPos - ctx.position;
      const tol = qty / 2;
      if (delta > tol) return { signal: "buy", qty: delta, price, reason: `grid lvl ${levelIndex}` };
      if (delta < -tol) return { signal: "sell", qty: -delta, price, reason: `grid lvl ${levelIndex}` };
      return hold(`grid lvl ${levelIndex}`);
    }
    case "dca": {
      const interval = Number(ctx.params.interval_minutes) * 60;
      const quote = Number(ctx.params.quote_amount);
      if (quote <= 0 || price <= 0) return hold("invalid amount");
      const now = Math.floor(Date.now() / 1000);
      if (ctx.lastBuyTs && now - ctx.lastBuyTs < interval)
        return hold(`next buy in ${Math.ceil((interval - (now - ctx.lastBuyTs)) / 60)}m`);
      const buyQty = quote / price;
      return { signal: "buy", qty: buyQty, price, reason: `DCA ${quote}` };
    }
  }
}