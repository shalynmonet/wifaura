import { liveDollarWifQuote } from "./price.server";
import { marketRequest } from "./market-request.server";
let cached: Promise<unknown> | undefined;
let until = 0;
export function priceHealth() {
  if (cached && Date.now() < until) return cached;
  until = Date.now() + 30_000;
  cached = probePrice();
  return cached;
}
export async function probePrice(request: typeof fetch = marketRequest) {
  let status: number | null = null;
  let challenged = false;
  try {
    const quote = await liveDollarWifQuote(18, async (input, init) => {
      const response = await request(input, init);
      status = response.status;
      challenged = response.headers.get("cf-mitigated") === "challenge";
      return response;
    });
    return {
      state: "available",
      httpStatus: status,
      rate: quote.rate,
      observedAt: quote.observedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const state = challenged
      ? "provider-challenge"
      : status === 429
        ? "provider-rate-limit"
        : status !== null && status !== 200
          ? "provider-http-error"
          : /stale/.test(message)
            ? "stale-price"
            : /inactive|liquidity/.test(message)
              ? "inactive-market"
              : status === null
                ? "connection-failed"
                : "invalid-market-response";
    return { state, httpStatus: status };
  }
}
