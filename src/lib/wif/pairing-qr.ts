import { toCanvas } from "qrcode";

// Pairing URIs stay in this page; never log or send them to an image service.
export function pairingQr(uri: string, cancel: () => void) {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-label", "Connect Robinhood Wallet");
  dialog.style.cssText =
    "max-width:360px;width:90vw;padding:24px;border-radius:12px;background:#fff;color:#111;";
  const title = document.createElement("h2");
  title.textContent = "Connect Robinhood Wallet";
  title.style.cssText = "font-size:20px;font-weight:600;margin-bottom:12px";
  const text = document.createElement("p");
  text.textContent =
    "On your iPhone, open Robinhood Wallet → Web3 → the scanner beside Search. Scan this code and approve the connection. Keep this page open on your computer.";
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
  dialog.append(title, text, canvas, button);
  document.body.append(dialog);
  dialog.showModal();
  void toCanvas(canvas, uri, { width: 300, margin: 2, errorCorrectionLevel: "M" }).catch(() => {
    text.textContent = "Unable to display the connection code. Cancel and try again.";
  });
  return () => {
    dialog.close();
    dialog.remove();
  };
}
