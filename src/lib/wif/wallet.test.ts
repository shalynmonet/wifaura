import { beforeEach, afterEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ init: vi.fn(), connect: vi.fn(), on: vi.fn(), ping: vi.fn() }));
vi.mock("@walletconnect/universal-provider", () => ({ UniversalProvider: { init: mock.init } }));
vi.mock("./pairing-qr", () => ({ pairingQr: vi.fn(() => vi.fn()) }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("window", {});
  const provider = {
    session: undefined as
      undefined | { topic: string; namespaces: { eip155: { accounts: string[] } } },
    client: { ping: mock.ping },
    connect: mock.connect,
    on: mock.on,
    removeListener: vi.fn(),
    setDefaultChain: vi.fn(),
  };
  mock.init.mockResolvedValue(provider);
  mock.ping.mockResolvedValue(undefined);
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
  await expect(getWifProvider(true)).rejects.toThrow(/did not authorize Robinhood Chain/);
  expect(mock.connect).not.toHaveBeenCalled();
});
it("recovery closes the old session without pairing or requesting a signature", async () => {
  vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "a".repeat(32));
  const disconnect = vi.fn().mockResolvedValue(undefined);
  const request = vi.fn();
  mock.init.mockResolvedValue({ session: { namespaces: {} }, disconnect, request });
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
