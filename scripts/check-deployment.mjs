// Read-only: validates deployed runtime against locally compiled source before
// producing the hash the application requires. Never signs or broadcasts.
import assert from "node:assert/strict";
import { createPublicClient, http, erc20Abi, isAddress, keccak256 } from "viem";
import { compile } from "./contracts.mjs";
const token = "0x5173b8eA6923c2d40267890D45C46a3480954773";
const router = process.env.WIFAURA_PAYMENT_CONTRACT,
  treasury = process.env.WIFAURA_TREASURY;
assert(
  router && isAddress(router) && treasury && isAddress(treasury),
  "Set public contract and treasury addresses.",
);
const url = process.env.WIFAURA_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
assert.equal(new URL(url).protocol, "https:");
const client = createPublicClient({
  transport: http(url, { retryCount: 0, timeout: 12000, fetchOptions: { redirect: "manual" } }),
});
assert.equal(await client.getChainId(), 4663);
const artifact = compile()["WifauraPayments.sol"].WifauraPayments;
const code = await client.getCode({ address: router });
assert(code && code !== "0x", "No deployed code.");
let masked = code.slice(2);
for (const references of Object.values(artifact.evm.deployedBytecode.immutableReferences))
  for (const { start, length } of references)
    masked =
      masked.slice(0, start * 2) + "0".repeat(length * 2) + masked.slice((start + length) * 2);
assert.equal(
  masked.toLowerCase(),
  artifact.evm.deployedBytecode.object.toLowerCase(),
  "Deployed runtime differs from compiled source.",
);
assert.equal(
  (
    await client.readContract({ address: router, abi: artifact.abi, functionName: "token" })
  ).toLowerCase(),
  token.toLowerCase(),
);
assert.equal(
  (
    await client.readContract({ address: router, abi: artifact.abi, functionName: "treasury" })
  ).toLowerCase(),
  treasury.toLowerCase(),
);
assert.equal(
  await client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
  18,
);
console.log("Deployment source, token, treasury, chain and decimals verified.");
console.log(`WIFAURA_ROUTER_CODE_HASH=${keccak256(code)}`);
