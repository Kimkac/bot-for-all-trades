/**
 * Resolves which NOWPayments environment the configured API key belongs to.
 * A sandbox key against the live host (or vice-versa) returns 401/403/530
 * auth failures, so we probe once and cache the working base URL.
 */
const SANDBOX = "https://api.sandbox.nowpayments.io/v1";
const LIVE = "https://api.nowpayments.io/v1";

let cachedBase: string | null = null;

export function maskKey(key: string) {
  return `${key.slice(0, 6)}…(len ${key.length})`;
}

async function keyWorks(base: string, apiKey: string) {
  try {
    const res = await fetch(`${base}/balance`, { headers: { "x-api-key": apiKey } });
    // 401/403 = wrong environment for this key. 530 = upstream auth rejection.
    return res.status !== 401 && res.status !== 403 && res.status !== 530;
  } catch {
    return false;
  }
}

export async function getNowPaymentsBase(apiKey: string): Promise<string> {
  if (cachedBase) return cachedBase;

  const forced = process.env.NOWPAYMENTS_ENV?.toLowerCase();
  if (forced === "live" || forced === "production") {
    cachedBase = LIVE;
  } else if (forced === "sandbox") {
    cachedBase = SANDBOX;
  } else {
    cachedBase = (await keyWorks(SANDBOX, apiKey)) ? SANDBOX : LIVE;
  }

  console.log(
    `[nowpayments] key ${maskKey(apiKey)} -> ${cachedBase === SANDBOX ? "sandbox" : "live"} (${cachedBase})`,
  );
  return cachedBase;
}

export interface MinAmountInfo {
  currency: string;
  /** Minimum payable amount denominated in the pay currency (e.g. USDT). */
  min_amount: number;
  /** Same minimum expressed in USD, when NOWPayments provides a fiat equivalent. */
  min_usd: number | null;
}

const minCache = new Map<string, { value: MinAmountInfo; at: number }>();
const MIN_TTL_MS = 5 * 60 * 1000;

/**
 * Fetches the minimum payment amount NOWPayments accepts for a coin/network.
 * Cached briefly since the value moves only with network fees.
 */
export async function getMinAmount(apiKey: string, payCurrency: string): Promise<MinAmountInfo> {
  const key = payCurrency.toLowerCase();
  const hit = minCache.get(key);
  if (hit && Date.now() - hit.at < MIN_TTL_MS) return hit.value;

  const base = await getNowPaymentsBase(apiKey);
  const url = `${base}/min-amount?currency_from=${encodeURIComponent(key)}&currency_to=${encodeURIComponent(key)}&fiat_equivalent=usd`;
  const res = await fetch(url, { headers: { "x-api-key": apiKey } });
  const data = (await res.json().catch(() => ({}))) as {
    min_amount?: number | string;
    fiat_equivalent?: number | string;
    message?: string;
  };
  if (!res.ok) {
    console.error(`[nowpayments] min-amount ${key} -> ${res.status}`, data);
    throw new Error(data.message ?? `Could not load minimum amount for ${payCurrency.toUpperCase()}`);
  }

  const min_amount = Number(data.min_amount ?? 0);
  const fiat = Number(data.fiat_equivalent ?? 0);
  const info: MinAmountInfo = {
    currency: key,
    min_amount: Number.isFinite(min_amount) ? min_amount : 0,
    min_usd: Number.isFinite(fiat) && fiat > 0 ? fiat : null,
  };
  minCache.set(key, { value: info, at: Date.now() });
  return info;
}
