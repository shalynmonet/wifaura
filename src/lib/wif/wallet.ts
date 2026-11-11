import { createWalletClient, custom, erc20Abi, type EIP1193Provider } from "viem";
import { paymentAbi, robinhood, WIF_TOKEN, type WifQuote } from "./config";

let selectedProvider: EIP1193Provider | undefined;
let walletConnectProvider: EIP1193Provider | undefined;
let connecting: Promise<EIP1193Provider> | undefined;
export async function getWifProvider(forceWalletConnect = false): Promise<EIP1193Provider> {
  if (selectedProvider && (!forceWalletConnect || selectedProvider === walletConnectProvider))
    return selectedProvider;
  const injected = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
  if (injected && !forceWalletConnect) return (selectedProvider = injected);
  if (connecting) return connecting;
  connecting = (async () => {
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
    });
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
        "Wallet did not authorize Robinhood Chain. Reconnect and approve chain 4663.",
      );
    provider.setDefaultChain(`eip155:${robinhood.id}`, robinhood.rpcUrls.default.http[0]);
    selectedProvider = provider as EIP1193Provider;
    walletConnectProvider = selectedProvider;
    return selectedProvider;
  })();
  try {
    return await connecting;
  } finally {
    connecting = undefined;
  }
}
async function wallet(forceWalletConnect = false) {
  const ethereum = await getWifProvider(forceWalletConnect);
  return createWalletClient({ chain: robinhood, transport: custom(ethereum) });
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
  if (
    (await client.getChainId()) !== robinhood.id ||
    address?.toLowerCase() !== q.sender.toLowerCase()
  )
    throw new Error(
      "Wallet account or network changed. Restore the quoted account on Robinhood Chain.",
    );
  if (Date.now() >= Date.parse(q.expires_at))
    throw new Error("Quote expired. Check any existing payment before requesting another.");
  return client;
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
