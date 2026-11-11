import { createWalletClient, custom, erc20Abi, type EIP1193Provider } from "viem";
import { paymentAbi, robinhood, WIF_TOKEN, type WifQuote } from "./config";

function wallet() {
  const ethereum = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
  if (!ethereum)
    throw new Error("Open WIFAURA in an EVM wallet browser or install a compatible wallet.");
  return createWalletClient({ chain: robinhood, transport: custom(ethereum) });
}
export async function connectWifWallet() {
  const client = wallet();
  try {
    await client.switchChain({ id: robinhood.id });
  } catch (error) {
    const e = error as { code?: number; cause?: { code?: number } };
    if (e.code !== 4902 && e.cause?.code !== 4902) throw error;
    await client.addChain({ chain: robinhood });
    await client.switchChain({ id: robinhood.id });
  }
  const [address] = await client.requestAddresses();
  if (!address) throw new Error("No wallet account selected.");
  return address;
}
export async function signWifMessage(message: string, address: `0x${string}`) {
  const client = wallet();
  return client.signMessage({ account: address, message });
}
async function checkedWallet(q: WifQuote) {
  const client = wallet();
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
