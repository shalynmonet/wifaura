// @vitest-environment node
import { expect, it, vi } from "vitest";
import { probePrice } from "./price-health.server";
it("distinguishes blocked and throttled provider responses without treating them as valid prices", async () => {
  const blocked = vi.fn<typeof fetch>().mockResolvedValue(
    new Response("private provider body", {
      status: 403,
      headers: { "cf-mitigated": "challenge" },
    }),
  );
  expect(await probePrice(blocked)).toEqual({ state: "provider-challenge", httpStatus: 403 });
  const throttled = vi.fn<typeof fetch>().mockResolvedValue(new Response("limit", { status: 429 }));
  expect(await probePrice(throttled)).toEqual({ state: "provider-rate-limit", httpStatus: 429 });
});
