import { createPublicClient, http, type Transport } from "viem";
import { robinhood } from "./config";
import { rpcFetch } from "./rpc-fetch.server";
export type RpcProvider = { name: "quicknode" | "getblock" | "alchemy" | "public"; url: string };
export function configuredProviders(
  includeSponsors = process.env["WIFAURA_SPONSOR_RPC_ENABLED"] === "true",
): RpcProvider[] {
  const result: RpcProvider[] = [];
  if (includeSponsors && process.env["QUICKNODE_RPC_URL"])
    result.push({ name: "quicknode", url: process.env["QUICKNODE_RPC_URL"]!.trim() });
  if (includeSponsors && process.env["GETBLOCK_RPC_URL"])
    result.push({ name: "getblock", url: process.env["GETBLOCK_RPC_URL"]!.trim() });
  if (process.env["WIFAURA_PRIVATE_RPC_URL"])
    result.push({ name: "alchemy", url: process.env["WIFAURA_PRIVATE_RPC_URL"]! });
  else
    result.push({
      name: "public",
      url: process.env["WIFAURA_RPC_URL"] || robinhood.rpcUrls.default.http[0],
    });
  for (const entry of result) {
    let url: URL;
    try {
      url = new URL(entry.url);
    } catch {
      throw new Error("Invalid server chain endpoint configuration.");
    }
    if (url.protocol !== "https:") throw new Error("HTTPS chain RPC required.");
    if (entry.name === "quicknode" && !url.hostname.endsWith(".quiknode.pro"))
      throw new Error("QuickNode endpoint hostname is not recognized.");
    if (entry.name === "getblock" && !url.hostname.endsWith(".getblock.io"))
      throw new Error("GetBlock endpoint hostname is not recognized.");
  }
  return result;
}
const reads = new Set([
  "eth_chainId",
  "eth_call",
  "eth_getCode",
  "eth_blockNumber",
  "eth_getTransactionReceipt",
  "eth_getBlockByNumber",
  "eth_getBlockByHash",
  "eth_getLogs",
  "eth_getBalance",
  "eth_getTransactionCount",
  "eth_getTransactionByHash",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
]);
function isThrottled(error: unknown) {
  let value = error;
  for (let depth = 0; depth < 10 && value && typeof value === "object"; depth++) {
    const e = value as { status?: unknown; code?: unknown; message?: unknown; cause?: unknown };
    if (
      e.status === 429 ||
      e.code === 429 ||
      (typeof e.message === "string" && e.message.startsWith("Robinhood Chain is busy."))
    )
      return true;
    value = e.cause;
  }
  return false;
}
export function createReadClient(
  providers: RpcProvider[],
  fetchForUrl: (url: string) => typeof fetch = rpcFetch,
) {
  if (!providers.length) throw new Error("No chain provider configured.");
  const transport: Transport = (options) => {
    const bases = providers.map((p) =>
      http(p.url, {
        timeout: 8000,
        retryCount: 0,
        fetchFn: fetchForUrl(p.url),
        fetchOptions: { redirect: "manual" },
      })(options),
    );
    const verified: Array<Promise<void> | undefined> = [];
    function checkChain(index: number) {
      return (verified[index] ??= (async () => {
        const id = await bases[index]!.request({ method: "eth_chainId" });
        if (Number(id) !== robinhood.id) throw new Error("Wrong verification chain.");
      })().catch((error) => {
        verified[index] = undefined;
        throw error;
      }));
    }
    const request = (async (...args: Parameters<(typeof bases)[number]["request"]>) => {
      if (!reads.has(args[0].method))
        throw new Error("Server RPC is read-only. Wallet transactions cannot be retried here.");
      let throttled = false;
      for (let i = 0; i < bases.length; i++) {
        try {
          await checkChain(i);
          return args[0].method === "eth_chainId"
            ? `0x${robinhood.id.toString(16)}`
            : await bases[i]!.request(...args);
        } catch (error) {
          throttled ||= isThrottled(error);
        }
      }
      // No endpoint URL, provider response body or credential reaches the browser.
      throw new Error(
        throttled
          ? "Robinhood Chain is busy. Wait one minute, then check again. Do not resend a pending payment."
          : "Unable to read Robinhood Chain. Check again later; do not resend a pending payment.",
      );
    }) as (typeof bases)[number]["request"];
    return { ...bases[0]!, request };
  };
  return createPublicClient({ chain: robinhood, transport });
}
