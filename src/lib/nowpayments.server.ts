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
