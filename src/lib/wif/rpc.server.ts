import {
  createPublicClient,
  decodeEventLog,
  erc20Abi,
  getAddress,
  http,
  isAddress,
  keccak256,
  type Hash,
} from "viem";
import { paymentAbi, robinhood, WIF_TOKEN, type WifQuote } from "./config";

export function chainClient() {
  const url = process.env["WIFAURA_RPC_URL"] || robinhood.rpcUrls.default.http[0];
  if (new URL(url).protocol !== "https:") throw new Error("HTTPS chain RPC required.");
  return createPublicClient({
    chain: robinhood,
    transport: http(url, { timeout: 12_000, retryCount: 0, fetchOptions: { redirect: "manual" } }),
  });
}
export async function paymentConfiguration() {
  if (process.env["WIFAURA_PAYMENTS_ENABLED"] !== "true")
    throw new Error("WIF payments await deployment and verification.");
  const router = process.env["WIFAURA_PAYMENT_CONTRACT"] || "";
  const treasury = process.env["WIFAURA_TREASURY"] || "";
  if (!isAddress(router) || !isAddress(treasury))
    throw new Error("Payment contract and treasury are not configured.");
  const client = chainClient();
  if ((await client.getChainId()) !== robinhood.id) throw new Error("Wrong verification chain.");
  const expectedCodeHash = process.env["WIFAURA_ROUTER_CODE_HASH"];
  const code = await client.getCode({ address: getAddress(router) });
  if (
    !code ||
    !expectedCodeHash ||
    keccak256(code).toLowerCase() !== expectedCodeHash.toLowerCase()
  )
    throw new Error("Payment contract bytecode has not been verified and pinned.");
  const [token, destination, decimals] = await Promise.all([
    client.readContract({ address: getAddress(router), abi: paymentAbi, functionName: "token" }),
    client.readContract({ address: getAddress(router), abi: paymentAbi, functionName: "treasury" }),
    client.readContract({ address: WIF_TOKEN, abi: erc20Abi, functionName: "decimals" }),
  ]);
  if (
    token.toLowerCase() !== WIF_TOKEN.toLowerCase() ||
    destination.toLowerCase() !== treasury.toLowerCase()
  )
    throw new Error("Payment contract does not match WIF or the configured treasury.");
  return { client, router: getAddress(router), treasury: getAddress(treasury), decimals };
}

// Pure evidence checks are also exercised with adversarial receipt fixtures.
export function matchingPayment(
  log: { address: string; topics: readonly Hash[]; data: Hash; removed?: boolean },
  q: WifQuote,
) {
  if (log.removed || log.address.toLowerCase() !== q.router.toLowerCase()) return false;
  try {
    const event = decodeEventLog({
      abi: paymentAbi,
      data: log.data,
      topics: log.topics as [Hash, ...Hash[]],
      eventName: "Paid",
      strict: true,
    });
    const a = event.args;
    return (
      a.quoteId.toLowerCase() === q.quote_key.toLowerCase() &&
      a.payer.toLowerCase() === q.sender.toLowerCase() &&
      a.reserve.toLowerCase() === q.reserve.toLowerCase() &&
      a.amount === BigInt(q.amount) &&
      a.reserveAmount * 2n === a.amount
    );
  } catch {
    return false;
  }
}
export async function verifyWifPayment(q: WifQuote, hash: Hash, createdAt: string) {
  const { client, router, treasury } = await paymentConfiguration();
  if (
    router.toLowerCase() !== q.router.toLowerCase() ||
    treasury.toLowerCase() !== q.treasury.toLowerCase()
  )
    throw new Error("Deployment changed; reconcile this quote using its original configuration.");
  return verifyReceiptEvidence(client, q, hash, createdAt);
}
export async function verifyReceiptEvidence(
  client: Pick<ReturnType<typeof chainClient>, "getTransactionReceipt" | "getBlock">,
  q: WifQuote,
  hash: Hash,
  createdAt: string,
) {
  const receipt = await client.getTransactionReceipt({ hash });
  if (
    receipt.status !== "success" ||
    receipt.to?.toLowerCase() !== q.router.toLowerCase() ||
    receipt.from.toLowerCase() !== q.sender.toLowerCase() ||
    receipt.transactionHash.toLowerCase() !== hash.toLowerCase()
  )
    throw new Error("Transaction is not a successful payment from the quoted wallet.");
  const [canonical, finalized] = await Promise.all([
    client.getBlock({ blockNumber: receipt.blockNumber }),
    client.getBlock({ blockTag: "finalized" }),
  ]);
  if (canonical.hash !== receipt.blockHash)
    throw new Error("Receipt is not on the canonical chain.");
  if (finalized.number === null || finalized.number < receipt.blockNumber) return null;
  const time = Number(canonical.timestamp) * 1000;
  if (time < Math.floor(Date.parse(createdAt) / 1000) * 1000 || time > Date.parse(q.expires_at))
    throw new Error("Payment falls outside this quote window. Reconciliation required.");
  if (receipt.logs.filter((log) => matchingPayment(log, q)).length !== 1)
    throw new Error("Exact WIFAURA payment event missing.");
  // Re-read after finality evidence; a transient inconsistent RPC must never grant issuance.
  if ((await client.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash)
    throw new Error("Chain changed during verification.");
  return { block: receipt.blockNumber.toString(), blockHash: receipt.blockHash };
}
