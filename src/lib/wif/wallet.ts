import {
  createWalletClient,
  custom,
  erc20Abi,
  recoverMessageAddress,
  toHex,
  type EIP1193Provider,
} from "viem";
import { paymentAbi, robinhood, WIF_TOKEN, type WifQuote } from "./config";
import { mobileWalletRequest } from "./mobile-wallet";

async function createWalletConnect() {
  const projectId = import.meta.env["VITE_WALLETCONNECT_PROJECT_ID"];
  if (!projectId || !/^[a-fA-F0-9]{32}$/.test(projectId))
    throw new Error(
      "Robinhood Wallet connection is being configured. Please try again after setup is complete.",
    );
  const { UniversalProvider } = await import("@walletconnect/universal-provider");
  const provider = await UniversalProvider.init({
    projectId,
    telemetryEnabled: false,
    metadata: {
      name: "WIFAURA",
      description: "Daily digital collectibles with a 50% Reserve allocation",
      url: "https://wifaura.sha-i.com",
      icons: [],
    },
  });
  provider.on("disconnect", () => {
    selectedProvider = undefined;
    walletConnectProvider = undefined;
    activeWalletConnect = undefined;
    signingProof = undefined;
  });
  return provider;
}

// Recovery and reconnect must share one SignClient and its response listeners.
// Creating another client against the same persistent session can compete for
// incoming messages/history. Retain the initialized SDK even after disconnect.
let providerInitialization: ReturnType<typeof createWalletConnect> | undefined;
function initWalletConnect() {
  if (!providerInitialization) {
    providerInitialization = createWalletConnect().catch((error) => {
      providerInitialization = undefined;
      throw error;
    });
  }
  return providerInitialization;
}

export async function disconnectWifSession() {
  // Restore only; never initiate a pairing or a transaction during recovery.
  const provider = await initWalletConnect();
  if (provider.session) await provider.disconnect();
  selectedProvider = undefined;
  walletConnectProvider = undefined;
  activeWalletConnect = undefined;
  signingProof = undefined;
}

let selectedProvider: EIP1193Provider | undefined;
let walletConnectProvider: EIP1193Provider | undefined;
let activeWalletConnect: Awaited<ReturnType<typeof initWalletConnect>> | undefined;
let connecting: Promise<EIP1193Provider> | undefined;
let signingProof: { provider: EIP1193Provider; address: string; expires: number } | undefined;
export async function getWifProvider(forceWalletConnect = false): Promise<EIP1193Provider> {
  if (selectedProvider && (!forceWalletConnect || selectedProvider === walletConnectProvider))
    return selectedProvider;
  const injected = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
  if (injected && !forceWalletConnect) return (selectedProvider = injected);
  if (connecting) return connecting;
  connecting = (async () => {
    const provider = await initWalletConnect();
    if (!provider.session) {
      const { pairingQr } = await import("./pairing-qr");
      let closeQr: (() => void) | undefined;
      let rejectCancel: ((reason: Error) => void) | undefined;
      const cancelled = new Promise<never>((_, reject) => {
        rejectCancel = reject;
      });
      const display = (uri: string) => {
        closeQr?.();
        closeQr = pairingQr(uri, () => {
          provider.abortPairingAttempt();
          rejectCancel?.(new Error("Wallet connection cancelled. No transaction was sent."));
        });
      };
      provider.on("display_uri", display);
      try {
        await Promise.race([
          cancelled,
          provider.connect({
            namespaces: {
              eip155: {
                chains: [`eip155:${robinhood.id}`],
                methods: ["eth_sendTransaction", "personal_sign"],
                events: ["accountsChanged", "chainChanged"],
                rpcMap: { [robinhood.id]: robinhood.rpcUrls.default.http[0] },
              },
            },
          }),
        ]);
      } finally {
        closeQr?.();
        provider.removeListener("display_uri", display);
      }
    }
    const accounts = Object.values(provider.session?.namespaces ?? {}).flatMap((n) => n.accounts);
    if (!accounts.some((account) => account.startsWith(`eip155:${robinhood.id}:`)))
      throw new Error(
        "This wallet connection does not include Robinhood Chain. Use Set up phone network, then Change wallet app and reconnect. No transaction was requested.",
      );
    provider.setDefaultChain(`eip155:${robinhood.id}`, robinhood.rpcUrls.default.http[0]);
    selectedProvider = {
      request: (args) => {
        const send = () => provider.request(args as Parameters<typeof provider.request>[0]);
        return args.method === "personal_sign" || args.method === "eth_sendTransaction"
          ? mobileWalletRequest(
              send,
              provider.session?.peer?.metadata?.name || "your wallet",
              args.method,
            )
          : send();
      },
    } as EIP1193Provider;
    walletConnectProvider = selectedProvider;
    activeWalletConnect = provider;
    return selectedProvider;
  })();
  try {
    return await connecting;
  } finally {
    connecting = undefined;
  }
}
export async function testWifSigning(address: `0x${string}`) {
  signingProof = undefined;
  const provider = await getWifProvider();
  const client = createWalletClient({
    chain: robinhood,
    transport: custom(provider, { retryCount: 0 }),
  });
  const [account] = await client.getAddresses();
  if (
    account?.toLowerCase() !== address.toLowerCase() ||
    (await client.getChainId()) !== robinhood.id
  )
    throw new Error("Wallet account or network changed. Reconnect before testing.");
  const message = `WIFAURA wallet connectivity test\nOrigin: https://wifaura.sha-i.com\nThis signature only tests this wallet connection. It does not authorize a payment, contract deployment, token approval, or account login.\nTime: ${new Date().toISOString()}\nNonce: ${crypto.randomUUID()}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const signature = await Promise.race([
      provider.request({ method: "personal_sign", params: [toHex(message), address] }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "No signing response arrived. No transaction was requested. Do not deploy; share this result in the setup chat.",
              ),
            ),
          60000,
        );
      }),
    ]);
    const signer = await recoverMessageAddress({ message, signature });
    if (signer.toLowerCase() !== address.toLowerCase())
      throw new Error("Signing response belongs to a different wallet.");
    if (provider !== selectedProvider)
      throw new Error("Wallet connection changed during the test.");
    signingProof = { provider, address: address.toLowerCase(), expires: Date.now() + 120000 };
  } finally {
    clearTimeout(timer);
  }
}
export async function pingWifWallet(address?: `0x${string}`) {
  // A verified, fresh personal_sign response proves actual request delivery
  // even if a wallet does not answer the separate session-ping method.
  if (
    address &&
    signingProof &&
    signingProof.provider === selectedProvider &&
    signingProof.address === address.toLowerCase() &&
    signingProof.expires > Date.now()
  )
    return;
  const provider = activeWalletConnect;
  if (!provider?.session) throw new Error("Reconnect Robinhood Wallet before deployment.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      provider.client.ping({ topic: provider.session.topic }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "Wallet connection is not responding. Keep Robinhood Wallet open, then recover the connection before retrying. No deployment was requested.",
              ),
            ),
          12000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function wallet(forceWalletConnect = false) {
  const ethereum = await getWifProvider(forceWalletConnect);
  return createWalletClient({ chain: robinhood, transport: custom(ethereum, { retryCount: 0 }) });
}
export async function connectWifWallet(forceWalletConnect = false) {
  const client = await wallet(forceWalletConnect);
  if ((await client.getChainId()) !== robinhood.id) {
    try {
      await client.switchChain({ id: robinhood.id });
    } catch (error) {
      const e = error as { code?: number; cause?: { code?: number } };
      if (e.code !== 4902 && e.cause?.code !== 4902) throw error;
      await client.addChain({ chain: robinhood });
      await client.switchChain({ id: robinhood.id });
    }
  }
  const [address] = await client.requestAddresses();
  if (!address) throw new Error("No wallet account selected.");
  if ((await client.getChainId()) !== robinhood.id)
    throw new Error("Select Robinhood Chain in your wallet.");
  return address;
}
export async function signWifMessage(message: string, address: `0x${string}`) {
  const client = await wallet();
  return client.signMessage({ account: address, message });
}
async function checkedWallet(q: WifQuote) {
  const client = await wallet();
  const [address] = await client.getAddresses();
  if ((await client.getChainId()) !== robinhood.id)
    throw new Error("Select Robinhood Chain in your wallet before continuing.");
  if (address?.toLowerCase() !== q.sender.toLowerCase())
    throw new Error(
      `Connected wallet: ${address || "none"}. This quote requires payer ${q.sender}. Select that account in your wallet. To use a different payer, verify it in Account before requesting a new quote.`,
    );
  if (Date.now() >= Date.parse(q.expires_at))
    throw new Error("Quote expired. Check any existing payment before requesting another.");
  return client;
}
export async function assertWifWallet(q: WifQuote) {
  await checkedWallet(q);
}
export async function changeWifWallet() {
  await disconnectWifSession();
}
export async function approveWif(q: WifQuote) {
  const client = await checkedWallet(q);
  return client.writeContract({
    account: q.sender,
    address: WIF_TOKEN,
    abi: erc20Abi,
    functionName: "approve",
    args: [q.router, BigInt(q.amount)],
  });
}
export async function payWif(q: WifQuote) {
  const client = await checkedWallet(q);
  return client.writeContract({
    account: q.sender,
    address: q.router,
    abi: paymentAbi,
    functionName: "pay",
    args: [
      q.quote_key,
      q.reserve,
      BigInt(q.amount),
      BigInt(Math.floor(Date.parse(q.expires_at) / 1000)),
    ],
  });
}
