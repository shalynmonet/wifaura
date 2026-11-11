// @vitest-environment node
import { expect, it, vi } from "vitest";
import { protectedBackendFetch } from "./store.server";
it("uses opaque server keys only on apikey and refuses redirects or other destinations", async () => {
  const key = "sb_secret_test_fixture_only";
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
  const secured = protectedBackendFetch("https://example.supabase.co", key, request);
  await secured("https://example.supabase.co/rest/v1/wif_quotes", {
    headers: { Authorization: `Bearer ${key}` },
  });
  const options = request.mock.calls[0]![1]!;
  expect(new Headers(options.headers).get("apikey")).toBe(key);
  expect(new Headers(options.headers).has("Authorization")).toBe(false);
  expect(options.redirect).toBe("manual");
  expect(() => secured("https://other.example/rest/v1/wif_quotes")).toThrow(/destination mismatch/);
  expect(request).toHaveBeenCalledTimes(1);
});
it("preserves legacy JWT authorization while keeping the same destination restriction", async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"));
  await protectedBackendFetch(
    "https://example.supabase.co",
    "legacy.fixture.jwt",
    request,
  )("https://example.supabase.co/rest/v1/wif_quotes", {
    headers: { Authorization: "Bearer legacy.fixture.jwt" },
  });
  expect(new Headers(request.mock.calls[0]![1]!.headers).get("Authorization")).toBe(
    "Bearer legacy.fixture.jwt",
  );
});
