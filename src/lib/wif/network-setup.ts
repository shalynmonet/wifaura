import type { EIP1193Provider } from "viem";
import { robinhood } from "./config";
export async function setupRobinhoodNetwork(provider: EIP1193Provider) {
  if (Number(await provider.request({ method: "eth_chainId" })) === robinhood.id) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x1237" }],
    });
  } catch (error) {
    const e = error as { code?: number; cause?: { code?: number } };
    if (e.code !== 4902 && e.cause?.code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0x1237",
          chainName: robinhood.name,
          nativeCurrency: robinhood.nativeCurrency,
          rpcUrls: [robinhood.rpcUrls.default.http[0]],
          blockExplorerUrls: [robinhood.blockExplorers.default.url],
        },
      ],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x1237" }],
    });
  }
  if (Number(await provider.request({ method: "eth_chainId" })) !== robinhood.id)
    throw new Error("Robinhood Chain was not selected. No transaction was requested.");
}
