import { toCanvas } from "qrcode";
import { mobileWalletDevice } from "./mobile-wallet";

// WalletConnect's Robinhood listing registers this native scheme (no universal
// link). Reown's formatNativeUrl appends wc?uri=<encoded pairing URI>.
export function robinhoodPairingLink(uri: string) {
  return `robinhood-wallet://wc?uri=${encodeURIComponent(uri)}`;
}

// Pairing URIs stay in this page; never log or send them to an image service.
export function pairingQr(uri: string, cancel: () => void) {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-label", "Connect your wallet");
  dialog.style.cssText =
    "max-width:360px;width:90vw;padding:24px;border-radius:12px;background:#fff;color:#111;";
  const title = document.createElement("h2");
  title.textContent = "Connect your paying wallet";
  title.style.cssText = "font-size:20px;font-weight:600;margin-bottom:12px";
  const text = document.createElement("p");
  const mobile = mobileWalletDevice();
  text.textContent = mobile
    ? "Choose the app holding your paying wallet, approve the connection in the app, then return to this browser tab. Keep this tab open."
    : "Open your wallet app's WalletConnect scanner on your phone. Scan this code and approve the connection. Keep this page open on your computer.";
  const openWallet = document.createElement("a");
  openWallet.textContent = "Open Robinhood Wallet";
  openWallet.href = robinhoodPairingLink(uri);
  openWallet.style.cssText =
    "display:block;text-align:center;background:#cda34e;color:#111;padding:14px;border-radius:6px;margin:16px 0;font-weight:600";
  const metamask = document.createElement("a");
  metamask.textContent = "Open MetaMask";
  metamask.href = `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`;
  metamask.style.cssText = openWallet.style.cssText;
  const help = document.createElement("p");
  help.textContent =
    "If the app does not open, make sure the wallet app you selected is installed and open WIFAURA in Safari or Chrome.";
  help.style.cssText = "font-size:13px;margin-bottom:12px";
  const qr = document.createElement("details");
  qr.open = !mobile;
  const summary = document.createElement("summary");
  summary.textContent = "Connect using another device";
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", "WalletConnect pairing QR code");
  canvas.style.cssText = "max-width:100%;height:auto;margin:16px auto;display:block";
  const button = document.createElement("button");
  button.textContent = "Cancel connection";
  button.style.cssText = "border:1px solid #777;padding:10px 16px;border-radius:6px";
  button.onclick = cancel;
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    cancel();
  });
  qr.append(summary, canvas);
  if (mobile) dialog.append(title, text, metamask, openWallet, help, qr, button);
  else dialog.append(title, text, qr, metamask, openWallet, button);
  document.body.append(dialog);
  dialog.showModal();
  void toCanvas(canvas, uri, { width: 300, margin: 2, errorCorrectionLevel: "M" }).catch(() => {
    summary.textContent = "QR unavailable. Use Open Robinhood Wallet on this device.";
  });
  return () => {
    dialog.close();
    dialog.remove();
  };
}
