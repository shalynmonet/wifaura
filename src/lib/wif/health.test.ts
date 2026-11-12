// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
vi.mock("./rpc.server", () => ({
  paymentConfiguration: async () => ({ client: { getBlockNumber: async () => 1n } }),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});
it("reports the runtime private connection and coalesces probes without revealing its key", async () => {
  vi.stubEnv("WIFAURA_PRIVATE_RPC_URL", "https://private.example/v2/secret-key");
  const send = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ result: "0x1237" }), { status: 200 }));
  vi.stubGlobal("fetch", send);
  const { chainHealth } = await import("./health.server");
  const [one, two] = await Promise.all([chainHealth(), chainHealth()]);
  expect(one).toMatchObject({
    privateConfigured: true,
    state: "checkout-chain-verified",
    chainVerified: true,
  });
  expect(two).toEqual(one);
  expect(send).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(one)).not.toContain("secret-key");
});
it("reports provider rejection without returning a sensitive provider message", async () => {
  vi.stubEnv("WIFAURA_PRIVATE_RPC_URL", "https://private.example/v2/secret-key");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: -32000, message: "API key secret-key is invalid" } }),
          { status: 403 },
        ),
      ),
  );
  const { chainHealth } = await import("./health.server");
  const result = await chainHealth();
  expect(result).toMatchObject({ state: "access-rejected", httpStatus: 403 });
  expect(JSON.stringify(result)).not.toContain("secret-key");
});
