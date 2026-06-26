// Client-safe plan registry. Single source of truth for tier limits.

export type PlanTier = "starter" | "trader" | "pro" | "elite";

export interface PlanLimits {
  tier: PlanTier;
  name: string;
  price: number;
  maxBots: number;        // Infinity = unlimited
  maxExchanges: number;
  liveTrading: boolean;   // can connect a live (non-demo) exchange
  backtesting: boolean;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  starter: { tier: "starter", name: "Starter", price: 10,  maxBots: 1,        maxExchanges: 1,        liveTrading: false, backtesting: true  },
  trader:  { tier: "trader",  name: "Trader",  price: 30,  maxBots: 5,        maxExchanges: 3,        liveTrading: true,  backtesting: true  },
  pro:     { tier: "pro",     name: "Pro",     price: 60,  maxBots: 20,       maxExchanges: 10,       liveTrading: true,  backtesting: true  },
  elite:   { tier: "elite",   name: "Elite",   price: 100, maxBots: Infinity, maxExchanges: Infinity, liveTrading: true,  backtesting: true  },
};

export const PLAN_ORDER: PlanTier[] = ["starter", "trader", "pro", "elite"];