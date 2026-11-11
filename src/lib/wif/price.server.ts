import { z } from "zod";
import { WIF_TOKEN } from "./config";

// Pin the active, liquid WIF/ETH pool observed on the verified chain. Never
// select by symbol or silently switch to a thin/new pool with a cheaper price.
export const WIF_PRICE_POOL = "0x71ef4106340f0a3b9c19ec994eef4fc44a1d2513f38faac39d7636b156548c79";
export const WIF_PRICE_SOURCE = `https://api.dexscreener.com/latest/dex/pairs/robinhood/${WIF_PRICE_POOL}`;
export const PRICE_MAX_AGE_MS = 60_000;

/** $1, rounded up by less than two token base units to preserve an exact split. */
export function dollarWifAmount(rate: string, decimals: number): string {
  if (
    !/^(?:0|[1-9][0-9]{0,20})(?:\.[0-9]{1,36})?$/.test(rate) ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 36
  )
    throw new Error("Invalid WIF/USD rate.");
  const [whole, fraction = ""] = rate.split(".");
  const numerator = BigInt(whole! + fraction);
  if (numerator <= 0n) throw new Error("Invalid WIF/USD rate.");
  const units = 10n ** BigInt(decimals + fraction.length);
  const amount = ((units + 2n * numerator - 1n) / (2n * numerator)) * 2n;
  if (amount <= 0n || amount >= 2n ** 256n) throw new Error("WIF quote is outside token limits.");
  return amount.toString();
}

const marketSchema = z.object({
  pairs: z.array(
    z.object({
      chainId: z.string(),
      pairAddress: z.string(),
      dexId: z.string(),
      baseToken: z.object({ address: z.string() }),
      quoteToken: z.object({ address: z.string() }),
      priceUsd: z.string(),
      liquidity: z.object({ usd: z.number().finite().nonnegative() }),
      txns: z.object({
        m5: z.object({
          buys: z.number().int().nonnegative(),
          sells: z.number().int().nonnegative(),
        }),
      }),
    }),
  ),
});

export async function liveDollarWifQuote(decimals: number, request: typeof fetch = fetch) {
  const start = Date.now();
  const response = await request(WIF_PRICE_SOURCE, {
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "application/json", "User-Agent": "WIFAURA/1.0 live-USD-quote" },
  });
  if (!response.ok || response.status !== 200)
    throw new Error("Live WIF price unavailable. Please try later.");
  const now = Date.now();
  const providerTime = Date.parse(response.headers.get("date") || "");
  const ageHeader = response.headers.get("age");
  const age = ageHeader === null ? 0 : Number(ageHeader) * 1000;
  if (
    !Number.isFinite(providerTime) ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > PRICE_MAX_AGE_MS ||
    providerTime > now + 5000 ||
    now - providerTime > PRICE_MAX_AGE_MS ||
    now - start > 10_000
  )
    throw new Error("Live WIF price is stale or cannot be dated.");
  const body = await response.text();
  if (body.length > 64_000) throw new Error("Invalid market response.");
  const parsed = marketSchema.safeParse(JSON.parse(body));
  if (!parsed.success || parsed.data.pairs.length !== 1)
    throw new Error("Verified WIF market is unavailable.");
  const p = parsed.data.pairs[0]!;
  if (
    p.chainId !== "robinhood" ||
    p.pairAddress.toLowerCase() !== WIF_PRICE_POOL ||
    p.dexId !== "uniswap" ||
    p.baseToken.address.toLowerCase() !== WIF_TOKEN.toLowerCase() ||
    p.quoteToken.address !== "0x0000000000000000000000000000000000000000" ||
    p.liquidity.usd < 10_000 ||
    p.txns.m5.buys + p.txns.m5.sells === 0
  )
    throw new Error("Verified WIF market is inactive or lacks liquidity.");
  return {
    amount: dollarWifAmount(p.priceUsd, decimals),
    rate: p.priceUsd,
    source: WIF_PRICE_SOURCE,
    observedAt: new Date(providerTime).toISOString(),
  };
}
