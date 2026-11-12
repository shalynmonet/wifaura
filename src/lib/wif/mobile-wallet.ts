export function mobileWalletDevice() {
  return (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}
export function walletAppLink(name: string) {
  if (/metamask/i.test(name)) return "metamask://";
  if (/robinhood/i.test(name)) return "robinhood-wallet://";
  return null;
}
// Opening the app only foregrounds the wallet. The callback sends exactly one
// SDK request; returning to the browser never retries it.
export async function mobileWalletRequest<T>(
  send: () => Promise<T>,
  name: string,
  method: string,
): Promise<T> {
  if (!mobileWalletDevice()) return send();
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-label", "Review in your wallet");
  dialog.style.cssText =
    "max-width:360px;width:90vw;padding:24px;border-radius:12px;background:#fff;color:#111";
  const text = document.createElement("p");
  text.textContent = `${method === "personal_sign" ? "Review the ownership message" : "Review the transaction and network fee"} in ${name || "your wallet"}, then return to this browser tab. Opening the app does not approve anything. Do not start another request.`;
  dialog.append(text);
  const url = walletAppLink(name);
  if (url) {
    const link = document.createElement("a");
    link.href = url;
    link.textContent = `Open ${/metamask/i.test(name) ? "MetaMask" : "Robinhood Wallet"}`;
    link.style.cssText =
      "display:block;padding:14px;margin-top:16px;background:#cda34e;color:#111;text-align:center;border-radius:6px";
    dialog.append(link);
  }
  dialog.addEventListener("cancel", (e) => e.preventDefault());
  document.body.append(dialog);
  dialog.showModal();
  try {
    return await send();
  } finally {
    dialog.close();
    dialog.remove();
  }
}
