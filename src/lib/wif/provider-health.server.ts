import { keccak256 } from "viem";
import { configuredProviders, createReadClient } from "./rpc-providers.server";
import { verifyReceiptEvidence } from "./rpc.server";
import type { WifQuote } from "./config";
const reference: WifQuote = {
  id: "health",
  drop_id: "health",
  intention: "receive",
  sender: "0xb6B05f072A361d149095f03FA904B544d7d1418f",
  reserve: "0xE885CaC40af6D7523f58F79e56a4a1a1Acd1b6fC",
  treasury: "0x1fbe8ca7ab3bb424520972b6e27c0130f4971985",
  router: "0x2d889Ff462B21177A4C2E6384D258eC867222D69",
  quote_key: "0x000000006af5d132a974c14118a111239f6fae7fa18b63725009d3ca742a76f5",
  amount: "814995925020374898126",
  decimals: 18,
  expires_at: "2026-11-12T14:46:10Z",
  status: "fulfilled",
  manifestation_id: null,
  tx_hash: "0xee1a9c7b57ae4643da3d38e518ffb4fd11585cc8e88049a19e46514f74167be3",
};
const cache = new Map<string, { until: number; result: Promise<unknown> }>();
export function providerHealth(name: "quicknode" | "getblock" | "alchemy") {
  const cached = cache.get(name);
  if (cached && cached.until > Date.now()) return cached.result;
  const result = probe(name);
  cache.set(name, { until: Date.now() + 60_000, result });
  return result;
}
async function probe(name: "quicknode" | "getblock" | "alchemy") {
  let stage = "configuration";
  try {
    const provider = configuredProviders(true).find((p) => p.name === name);
    if (!provider) return { provider: name, configured: false, state: "not-configured" };
    stage = "chain-id";
    const response = await fetch(provider.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    const body = (await response.json().catch(() => null)) as { result?: string } | null;
    if (!response.ok || Number(body?.result) !== 4663)
      return {
        provider: name,
        configured: true,
        state: "connection-rejected",
        stage,
        httpStatus: response.status,
      };
    const client = createReadClient([provider]);
    stage = "contract-code";
    const code = await client.getCode({ address: reference.router });
    if (
      !code ||
      keccak256(code) !== "0x4bdfd605b0c3ba7414344ccdb5290cde5e0862eb570ace6e43edd5f7821419b4"
    )
      return { provider: name, configured: true, state: "contract-mismatch" };
    stage = "finalized-payment";
    const proof = await verifyReceiptEvidence(
      client,
      reference,
      reference.tx_hash!,
      "2026-11-12T14:44:11.451091Z",
    );
    return {
      provider: name,
      configured: true,
      state: proof ? "verified" : "awaiting-finality",
      chainId: 4663,
      contractVerified: true,
      finalizedPaymentVerified: !!proof,
      paymentHash: reference.tx_hash,
      canonicalBlock: proof?.block,
    };
  } catch {
    return { provider: name, configured: true, state: "verification-failed", stage };
  }
}
