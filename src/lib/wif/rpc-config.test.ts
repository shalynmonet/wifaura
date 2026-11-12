// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { chainClient } from "./rpc.server";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("prefers the private server endpoint over the shared endpoint", () => {
  vi.stubEnv("WIFAURA_PRIVATE_RPC_URL", "https://private.example/v2/test-key");
  vi.stubEnv("WIFAURA_RPC_URL", "https://shared.example");
  expect(chainClient().transport.url).toBe("https://private.example/v2/test-key");
});
it("rejects an insecure private endpoint rather than falling back", () => {
  vi.stubEnv("WIFAURA_PRIVATE_RPC_URL", "http://private.example");
  expect(() => chainClient()).toThrow("HTTPS chain RPC required");
});
it("keeps the private endpoint key out of chain read failures", async () => {
  vi.stubEnv("WIFAURA_PRIVATE_RPC_URL", "https://failure.example/v2/do-not-expose-this-key");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
  const result = await chainClient()
    .getChainId()
    .catch((error) => error.message as string);
  expect(result).toContain("Unable to read Robinhood Chain");
  expect(result).not.toContain("do-not-expose-this-key");
});
