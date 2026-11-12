// Fixed read-only probe: no caller-selected URL, address, RPC method or payload.
// Public response contains no endpoint URL, key, provider body or user data.
let cached: Promise<unknown> | undefined;
let until = 0;
export function chainHealth() {
  if (cached && Date.now() < until) return cached;
  until = Date.now() + 60_000;
  cached = probe();
  return cached;
}
async function probe() {
  const privateConfigured = !!process.env["WIFAURA_PRIVATE_RPC_URL"];
  const url =
    process.env["WIFAURA_PRIVATE_RPC_URL"] ||
    process.env["WIFAURA_RPC_URL"] ||
    "https://rpc.mainnet.chain.robinhood.com";
  try {
    if (new URL(url).protocol !== "https:")
      return { privateConfigured, state: "invalid-configuration" };
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    });
    const body = (await response.json().catch(() => null)) as {
      result?: unknown;
      error?: { code?: unknown; message?: unknown };
    } | null;
    const message = typeof body?.error?.message === "string" ? body.error.message : "";
    const state =
      response.status === 429 || /rate.limit|capacity|compute units/i.test(message)
        ? "rate-limited"
        : response.status === 401 ||
            response.status === 403 ||
            /auth|api.key|access|allowlist/i.test(message)
          ? "access-rejected"
          : body?.result === "0x1237" && response.ok
            ? "connected"
            : "unexpected-response";
    if (state === "connected") {
      let stage = "configuration";
      try {
        const { paymentConfiguration } = await import("./rpc.server");
        const cfg = await paymentConfiguration((value) => {
          stage = value;
        });
        stage = "head";
        const head = await cfg.client.getBlockNumber();
        return {
          privateConfigured,
          httpStatus: response.status,
          state: "checkout-chain-verified",
          chainVerified: true,
          contractVerified: true,
          head: head.toString(),
        };
      } catch {
        return {
          privateConfigured,
          httpStatus: response.status,
          state: "contract-check-failed",
          chainVerified: true,
          contractVerified: false,
          stage,
        };
      }
    }
    return {
      privateConfigured,
      httpStatus: response.status,
      state,
      chainVerified: false,
      rpcErrorCode: typeof body?.error?.code === "number" ? body.error.code : null,
    };
  } catch {
    return { privateConfigured, state: "connection-failed" };
  }
}
