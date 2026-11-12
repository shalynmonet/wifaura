import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { fromHex, decodeFunctionData } from "viem";
import { paymentAbi, type WifQuote } from "./config";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const mock = vi.hoisted(() => ({
  init: vi.fn(),
  connect: vi.fn(),
  on: vi.fn(),
  ping: vi.fn(),
  request: vi.fn(),
  disconnect: vi.fn(),
}));
const checkout: WifQuote = {
  id: "quote",
  intention: "receive",
  drop_id: "drop",
  treasury: "0x4444444444444444444444444444444444444444",
  decimals: 18,
  status: "quoted",
  tx_hash: null,
  manifestation_id: null,
  sender: "0x1111111111111111111111111111111111111111",
  reserve: "0x2222222222222222222222222222222222222222",
  router: "0x3333333333333333333333333333333333333333",
  quote_key: `0x${"a".repeat(64)}`,
  amount: "1000",
  expires_at: "2030-01-01T00:00:00Z",
};
it("rejects a different phone payer before asking the wallet to send", async () => {
  const request = vi.fn(async ({ method }: { method: string }) =>
    method === "eth_accounts" ? [checkout.reserve] : "0x1237",
  );
  vi.stubGlobal("window", { ethereum: { request } });
  const { payWif } = await import("./wallet");
  await expect(payWif(checkout)).rejects.toThrow(`This quote requires payer ${checkout.sender}`);
  expect(request.mock.calls.some(([call]) => call.method === "eth_sendTransaction")).toBe(false);
});
it("sends only the quoted payment and never retries a rejected transaction", async () => {
  let transaction: { to: string; data: `0x${string}` } | undefined;
  const request = vi.fn(async ({ method, params }: { method: string; params?: unknown[] }) => {
    if (method === "eth_accounts") return [checkout.sender];
    if (method === "eth_chainId") return "0x1237";
    if (method === "eth_sendTransaction") {
      transaction = params![0] as { to: string; data: `0x${string}` };
      throw Object.assign(new Error("Rejected"), { code: 4001 });
    }
    throw new Error(`Unexpected ${method}`);
  });
  vi.stubGlobal("window", { ethereum: { request } });
  const { payWif } = await import("./wallet");
  await expect(payWif(checkout)).rejects.toThrow();
  expect(transaction!.to.toLowerCase()).toBe(checkout.router);
  const data = decodeFunctionData({ abi: paymentAbi, data: transaction!.data });
  expect(data.functionName).toBe("pay");
  expect(data.args).toEqual([
    checkout.quote_key,
    checkout.reserve,
    1000n,
    BigInt(Date.parse(checkout.expires_at) / 1000),
  ]);
  expect(request.mock.calls.filter(([call]) => call.method === "eth_sendTransaction")).toHaveLength(
    1,
  );
});
vi.mock("@walletconnect/universal-provider", () => ({ UniversalProvider: { init: mock.init } }));
vi.mock("./pairing-qr", () => ({ pairingQr: vi.fn(() => vi.fn()) }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mock.request.mockReset();
  vi.stubGlobal("window", {});
  const provider = {
    session: undefined as
      undefined | { topic: string; namespaces: { eip155: { accounts: string[] } } },
    client: { ping: mock.ping },
    request: mock.request,
    connect: mock.connect,
    disconnect: mock.disconnect,
    on: mock.on,
    removeListener: vi.fn(),
    setDefaultChain: vi.fn(),
  };
  mock.init.mockResolvedValue(provider);
  mock.ping.mockResolvedValue(undefined);
  mock.disconnect.mockImplementation(async () => {
    provider.session = undefined;
  });
  mock.connect.mockImplementation(async () => {
    provider.session = {
      topic: "test-session",
      namespaces: {
        eip155: { accounts: ["eip155:4663:0x1111111111111111111111111111111111111111"] },
      },
    };
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("refuses missing configuration before opening a wallet session", async () => {
  vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "");
  const { getWifProvider } = await import("./wallet");
  await expect(getWifProvider(true)).rejects.toThrow(/being configured/);
  expect(mock.init).not.toHaveBeenCalled();
});
it("shares one pairing request and pins the production origin and chain", async () => {
  vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "a".repeat(32));
  const { getWifProvider } = await import("./wallet");
  const [one, two] = await Promise.all([getWifProvider(true), getWifProvider(true)]);
  expect(one).toBe(two);
  expect(mock.init).toHaveBeenCalledTimes(1);
  expect(mock.connect).toHaveBeenCalledTimes(1);
  expect(mock.init).toHaveBeenCalledWith(
    expect.objectContaining({
      metadata: expect.objectContaining({ url: "https://wifaura.sha-i.com" }),
    }),
  );
  expect(mock.connect).toHaveBeenCalledWith(
    expect.objectContaining({
      namespaces: {
        eip155: {
          chains: ["eip155:4663"],
          methods: ["eth_sendTransaction", "personal_sign"],
          events: ["accountsChanged", "chainChanged"],
          rpcMap: { 4663: "https://rpc.mainnet.chain.robinhood.com" },
        },
      },
    }),
  );
  expect(await getWifProvider()).toBe(one);
});
it("preserves an injected provider unless WalletConnect is explicitly selected", async () => {
  const injected = { request: vi.fn() };
  vi.stubGlobal("window", { ethereum: injected });
  const { getWifProvider } = await import("./wallet");
  expect(await getWifProvider()).toBe(injected);
  expect(mock.init).not.toHaveBeenCalled();
});
it("does not require a network-switch method when already on Robinhood Chain", async () => {
  const account = "0x1111111111111111111111111111111111111111";
  const request = vi.fn(async ({ method }: { method: string }) => {
    if (method === "eth_chainId") return "0x1237";
    if (method === "eth_requestAccounts") return [account];
    throw new Error(`Unexpected wallet request: ${method}`);
  });
  vi.stubGlobal("window", { ethereum: { request } });
  const { connectWifWallet } = await import("./wallet");
  expect(await connectWifWallet()).toBe(account);
  expect(request.mock.calls.map(([call]) => call.method)).not.toContain(
    "wallet_switchEthereumChain",
  );
  expect(request.mock.calls.map(([call]) => call.method)).not.toContain("eth_sendTransaction");
});
it("rejects a restored session that does not authorize Robinhood Chain", async () => {
  vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "a".repeat(32));
  mock.init.mockResolvedValue({
    session: {
      namespaces: { eip155: { accounts: ["eip155:1:0x1111111111111111111111111111111111111111"] } },
    },
    on: mock.on,
  });
  const { getWifProvider } = await import("./wallet");
  await expect(getWifProvider(true)).rejects.toThrow(/does not include Robinhood Chain/);
  expect(mock.connect).not.toHaveBeenCalled();
});
it("recovery closes the old session without pairing or requesting a signature", async () => {
  vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "a".repeat(32));
  const disconnect = vi.fn().mockResolvedValue(undefined);
  const request = vi.fn();
  mock.init.mockResolvedValue({ session: { namespaces: {} }, disconnect, request, on: mock.on });
  const { disconnectWifSession } = await import("./wallet");
  await disconnectWifSession();
  expect(disconnect).toHaveBeenCalledOnce();
  expect(request).not.toHaveBeenCalled();
  expect(mock.connect).not.toHaveBeenCalled();
});
it("checks the wallet session before requesting a transaction", async () => {
  vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "a".repeat(32));
  const { getWifProvider, pingWifWallet } = await import("./wallet");
  await getWifProvider(true);
  await pingWifWallet();
  expect(mock.ping).toHaveBeenCalledWith({ topic: "test-session" });
});
it("stops waiting for an unreachable wallet without sending a transaction", async () => {
  vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "a".repeat(32));
  const { getWifProvider, pingWifWallet } = await import("./wallet");
  await getWifProvider(true);
  mock.ping.mockReturnValue(new Promise(() => {}));
  vi.useFakeTimers();
  const check = expect(pingWifWallet()).rejects.toThrow(/No deployment was requested/);
  await vi.advanceTimersByTimeAsync(12000);
  await check;
});
it("accepts an actual matching signature instead of relying on the ping method", async () => {
  vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "a".repeat(32));
  const account = privateKeyToAccount(generatePrivateKey());
  mock.request.mockImplementation(
    async ({ method, params }: { method: string; params?: string[] }) => {
      if (method === "eth_chainId") return "0x1237";
      if (method === "eth_accounts") return [account.address];
      if (method === "personal_sign")
        return account.signMessage({ message: fromHex(params![0]! as `0x${string}`, "string") });
      throw new Error("Unexpected request");
    },
  );
  const { getWifProvider, testWifSigning, pingWifWallet } = await import("./wallet");
  await getWifProvider(true);
  await testWifSigning(account.address);
  await pingWifWallet(account.address);
  expect(mock.ping).not.toHaveBeenCalled();
  expect(mock.request.mock.calls.some(([r]) => r.method === "eth_sendTransaction")).toBe(false);
  vi.useFakeTimers();
  await vi.advanceTimersByTimeAsync(120001);
  await pingWifWallet(account.address);
  expect(mock.ping).toHaveBeenCalledOnce();
});
it("rejects a signature from another wallet without establishing delivery proof", async () => {
  vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "a".repeat(32));
  const account = privateKeyToAccount(generatePrivateKey());
  const other = privateKeyToAccount(generatePrivateKey());
  mock.request.mockImplementation(
    async ({ method, params }: { method: string; params?: string[] }) => {
      if (method === "eth_chainId") return "0x1237";
      if (method === "eth_accounts") return [account.address];
      if (method === "personal_sign")
        return other.signMessage({ message: fromHex(params![0]! as `0x${string}`, "string") });
      throw new Error("Unexpected request");
    },
  );
  const { getWifProvider, testWifSigning, pingWifWallet } = await import("./wallet");
  await getWifProvider(true);
  await expect(testWifSigning(account.address)).rejects.toThrow(/different wallet/);
  await pingWifWallet(account.address);
  expect(mock.ping).toHaveBeenCalledOnce();
});
it("requires a connected wallet when no signing proof exists", async () => {
  const { pingWifWallet } = await import("./wallet");
  await expect(pingWifWallet("0x1111111111111111111111111111111111111111")).rejects.toThrow(
    /Reconnect Robinhood Wallet/,
  );
});
it("reuses one SDK client and one disconnect listener across recovery and reconnect", async () => {
  vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "a".repeat(32));
  const { getWifProvider, disconnectWifSession } = await import("./wallet");
  await getWifProvider(true);
  await disconnectWifSession();
  await getWifProvider(true);
  expect(mock.init).toHaveBeenCalledOnce();
  expect(mock.disconnect).toHaveBeenCalledOnce();
  expect(mock.connect).toHaveBeenCalledTimes(2);
  expect(mock.on.mock.calls.filter(([event]) => event === "disconnect")).toHaveLength(1);
});
it("allows a fresh initialization after an SDK startup failure", async () => {
  vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "a".repeat(32));
  mock.init.mockRejectedValueOnce(new Error("Startup failed"));
  const { getWifProvider } = await import("./wallet");
  await expect(getWifProvider(true)).rejects.toThrow("Startup failed");
  await getWifProvider(true);
  expect(mock.init).toHaveBeenCalledTimes(2);
  expect(mock.connect).toHaveBeenCalledOnce();
});
