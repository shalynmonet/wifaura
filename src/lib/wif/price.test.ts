// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import {
  dollarWifAmount,
  liveDollarWifQuote,
  WIF_PRICE_POOL,
  WIF_PRICE_SOURCE,
} from "./price.server";
import { WIF_TOKEN } from "./config";
const pair = {
  chainId: "robinhood",
  dexId: "uniswap",
  pairAddress: WIF_PRICE_POOL,
  baseToken: { address: WIF_TOKEN },
  quoteToken: { address: "0x0000000000000000000000000000000000000000" },
  priceUsd: "0.001255",
  liquidity: { usd: 94000 },
  txns: { m5: { buys: 3, sells: 2 } },
};
function mock(
  p: unknown = pair,
  headers: HeadersInit = { date: new Date().toUTCString() },
  status = 200,
) {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify({ pairs: [p] }), { status, headers }));
}
afterEach(() => vi.useRealTimers());
it("converts $1 with integer precision, rounds up by less than two base units and splits exactly", () => {
  expect(dollarWifAmount("0.002", 18)).toBe("500000000000000000000");
  expect(dollarWifAmount("0.001255", 18)).toBe("796812749003984063746");
  expect(dollarWifAmount("3", 18)).toBe("333333333333333334");
  for (const rate of [
    "0",
    "-1",
    "NaN",
    "Infinity",
    "1e-3",
    "",
    "0.0000000000000000000000000000000000001",
  ])
    expect(() => dollarWifAmount(rate, 18)).toThrow();
});
it("fetches the pinned Robinhood WIF pool and returns auditable rate evidence", async () => {
  const request = mock();
  const result = await liveDollarWifQuote(18, request);
  expect(result.amount).toBe("796812749003984063746");
  expect(result.rate).toBe("0.001255");
  expect(result.source).toBe(WIF_PRICE_SOURCE);
  expect(request).toHaveBeenCalledWith(
    WIF_PRICE_SOURCE,
    expect.objectContaining({ redirect: "manual", cache: "no-store" }),
  );
});
it("rejects stale, undated, cached and redirected rates instead of using a remembered price", async () => {
  const now = Date.now();
  await expect(
    liveDollarWifQuote(18, mock(pair, { date: new Date(now - 120000).toUTCString() })),
  ).rejects.toThrow(/stale/);
  await expect(liveDollarWifQuote(18, mock(pair, {}))).rejects.toThrow(/stale/);
  await expect(
    liveDollarWifQuote(18, mock(pair, { date: new Date(now).toUTCString(), age: "120" })),
  ).rejects.toThrow(/stale/);
  await expect(liveDollarWifQuote(18, mock(pair, {}, 302))).rejects.toThrow(/unavailable/);
  await expect(
    liveDollarWifQuote(18, vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"))),
  ).rejects.toThrow(/temporarily unavailable/);
});
it("recovers one transient provider failure using only a newly fetched validated price", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response("upstream unavailable", { status: 503 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ pairs: [pair] }), {
        status: 200,
        headers: { date: new Date().toUTCString() },
      }),
    );
  expect((await liveDollarWifQuote(18, request)).rate).toBe(pair.priceUsd);
  expect(request).toHaveBeenCalledTimes(2);
});
it("does not retry blocked or throttled requests and never accepts a stale retry", async () => {
  for (const status of [403, 429]) {
    const request = mock(pair, { date: new Date().toUTCString() }, status);
    await expect(liveDollarWifQuote(18, request)).rejects.toThrow(/unavailable/);
    expect(request).toHaveBeenCalledTimes(1);
  }
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response("offline", { status: 502 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ pairs: [pair] }), {
        status: 200,
        headers: { date: new Date(Date.now() - 120000).toUTCString() },
      }),
    );
  await expect(liveDollarWifQuote(18, request)).rejects.toThrow(/stale/);
  expect(request).toHaveBeenCalledTimes(2);
});
it("rejects wrong chains, impostor tokens, alternate pools, illiquid and inactive markets", async () => {
  for (const invalid of [
    { ...pair, chainId: "solana" },
    { ...pair, baseToken: { address: "0x" + "1".repeat(40) } },
    { ...pair, pairAddress: "0x" + "2".repeat(64) },
    { ...pair, liquidity: { usd: 100 } },
    { ...pair, txns: { m5: { buys: 0, sells: 0 } } },
    { ...pair, priceUsd: "0" },
  ])
    await expect(liveDollarWifQuote(18, mock(invalid))).rejects.toThrow();
});
