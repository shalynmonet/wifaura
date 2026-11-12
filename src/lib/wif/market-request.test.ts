// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { createMarketRequest } from "./market-request.server";
import { marketHandler, MARKET_URL } from "../../../supabase/functions/wif-market/handler";
import { liveDollarWifQuote, WIF_PRICE_SOURCE } from "./price.server";
afterEach(() => vi.unstubAllEnvs());
it("preserves provider throttling so the caller does not immediately retry it", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response("limit", { status: 429, headers: { "retry-after": "60" } }));
  const response = await marketHandler(new Request("https://backend.example"), request);
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("60");
  expect(request).toHaveBeenCalledTimes(1);
});
it("pins the relay source and refuses arbitrary upstream requests", async () => {
  expect(MARKET_URL).toBe(WIF_PRICE_SOURCE);
  const fetcher = vi.fn<typeof fetch>();
  await expect(createMarketRequest(fetcher)("https://other.example")).rejects.toThrow("Unapproved");
  expect(fetcher).not.toHaveBeenCalled();
});
it("forwards only the protected backend credential and preserves the original provider date", async () => {
  vi.stubEnv("WIFAURA_PRICE_RELAY_ENABLED", "true");
  vi.stubEnv("SUPABASE_URL", "https://bvnjosopyjblugshdbwd.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test-only");
  const old = new Date(Date.now() - 120000).toUTCString();
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response('{"pairs":[]}', {
      headers: { date: new Date().toUTCString(), "x-wifaura-provider-date": old },
    }),
  );
  const response = await createMarketRequest(fetcher)(WIF_PRICE_SOURCE);
  expect(response.headers.get("date")).toBe(old);
  expect(fetcher).toHaveBeenCalledWith(
    "https://bvnjosopyjblugshdbwd.supabase.co/functions/v1/wif-market",
    expect.objectContaining({
      redirect: "manual",
      headers: { apikey: "sb_secret_test-only", Accept: "application/json" },
    }),
  );
  await expect(
    liveDollarWifQuote(18, vi.fn<typeof fetch>().mockResolvedValue(response)),
  ).rejects.toThrow("stale");
});
it("the relay accepts no caller-selected source and preserves upstream evidence without storing a price", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response('{"pairs":[]}', {
      headers: {
        "content-type": "application/json",
        date: "Thu, 12 Nov 2026 14:00:00 GMT",
        age: "3",
      },
    }),
  );
  expect(
    (await marketHandler(new Request("https://backend.example?url=https://other.example"), fetcher))
      .status,
  ).toBe(405);
  expect(fetcher).not.toHaveBeenCalled();
  const response = await marketHandler(new Request("https://backend.example"), fetcher);
  expect(fetcher).toHaveBeenCalledWith(MARKET_URL, expect.objectContaining({ redirect: "manual" }));
  expect(response.headers.get("x-wifaura-provider-date")).toBe("Thu, 12 Nov 2026 14:00:00 GMT");
  expect(response.headers.get("x-wifaura-provider-age")).toBe("3");
  expect(response.headers.get("cache-control")).toBe("no-store");
});
