// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { configuredProviders, createReadClient, type RpcProvider } from "./rpc-providers.server";
afterEach(() => vi.unstubAllEnvs());
const providers: RpcProvider[] = [
  { name: "quicknode", url: "https://sample.robinhood-mainnet.quiknode.pro/private-primary" },
  { name: "getblock", url: "https://go.getblock.io/private-backup" },
];
function fake(respond: (name: string, method: string) => unknown | Response) {
  const calls: { name: string; method: string }[] = [];
  const forUrl =
    (url: string): typeof fetch =>
    async (_input, init) => {
      const body = JSON.parse(init!.body as string);
      const name = url.includes("quiknode") ? "quicknode" : "getblock";
      calls.push({ name, method: body.method });
      const result = respond(name, body.method);
      return result instanceof Response
        ? result
        : new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), {
            headers: { "content-type": "application/json" },
          });
    };
  return { calls, forUrl };
}
it("does not activate sponsor secrets until the switch is enabled", () => {
  vi.stubEnv("WIFAURA_SPONSOR_RPC_ENABLED", "false");
  vi.stubEnv("QUICKNODE_RPC_URL", providers[0]!.url);
  vi.stubEnv("GETBLOCK_RPC_URL", providers[1]!.url);
  vi.stubEnv("WIFAURA_PRIVATE_RPC_URL", "https://private.example/old");
  expect(configuredProviders().map((p) => p.name)).toEqual(["alchemy"]);
  vi.stubEnv("WIFAURA_SPONSOR_RPC_ENABLED", "true");
  expect(configuredProviders().map((p) => p.name)).toEqual(["quicknode", "getblock", "alchemy"]);
});
it("falls back to GetBlock for reads after a primary failure", async () => {
  const f = fake((name, method) =>
    method === "eth_chainId"
      ? "0x1237"
      : name === "quicknode"
        ? new Response("down", { status: 503 })
        : "0x99",
  );
  expect(await createReadClient(providers, f.forUrl).getBlockNumber()).toBe(153n);
  expect(f.calls).toEqual([
    { name: "quicknode", method: "eth_chainId" },
    { name: "quicknode", method: "eth_blockNumber" },
    { name: "getblock", method: "eth_chainId" },
    { name: "getblock", method: "eth_blockNumber" },
  ]);
});
it("never reads business data from a provider on the wrong chain", async () => {
  const f = fake((name, method) =>
    method === "eth_chainId" ? (name === "quicknode" ? "0xb626" : "0x1237") : "0x77",
  );
  expect(await createReadClient(providers, f.forUrl).getBlockNumber()).toBe(119n);
  expect(f.calls.filter((c) => c.name === "quicknode")).toEqual([
    { name: "quicknode", method: "eth_chainId" },
  ]);
});
it("never broadcasts or retries a wallet transaction through the read failover", async () => {
  const f = fake(() => "0x1237");
  await expect(
    createReadClient(providers, f.forUrl).request({
      method: "eth_sendRawTransaction",
      params: ["0xdead"],
    }),
  ).rejects.toThrow("read-only");
  expect(f.calls).toHaveLength(0);
});
it("does not expose either provider credential when every connection fails", async () => {
  const f = fake(() => new Response("private-primary private-backup", { status: 503 }));
  const message = await createReadClient(providers, f.forUrl)
    .getChainId()
    .catch((e) => e.message);
  expect(message).toContain("Unable to read");
  expect(message).not.toContain("private-primary");
  expect(message).not.toContain("private-backup");
});
