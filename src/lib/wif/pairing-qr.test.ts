import { afterEach, expect, it, vi } from "vitest";
import { pairingQr, robinhoodPairingLink } from "./pairing-qr";
vi.mock("qrcode", () => ({ toCanvas: vi.fn().mockResolvedValue(undefined) }));
const uri = `wc:${"a".repeat(64)}@2?relay-protocol=irn&symKey=${"b".repeat(64)}`;
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
function device(agent: string) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(agent);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: vi.fn(),
  });
}
it("hands the complete pairing URI to the registered wallet scheme without modifying it", () => {
  const link = new URL(robinhoodPairingLink(uri));
  expect(link.protocol).toBe("robinhood-wallet:");
  expect(link.searchParams.get("uri")).toBe(uri);
});
it("offers a direct same-phone link on iPhone and keeps QR scanning optional", () => {
  device("Mozilla/5.0 iPhone");
  const cancel = vi.fn();
  const close = pairingQr(uri, cancel);
  const link = document.querySelector("a")!;
  expect(link.textContent).toBe("Open Robinhood Wallet");
  expect(link.getAttribute("href")).toBe(robinhoodPairingLink(uri));
  expect(document.querySelector("details")!.open).toBe(false);
  expect(document.body.textContent).toContain("return to this browser tab");
  expect(cancel).not.toHaveBeenCalled();
  document.querySelector("button")!.click();
  expect(cancel).toHaveBeenCalledTimes(1);
  close();
  expect(document.querySelector("dialog")).toBeNull();
});
it("keeps the desktop QR expanded", () => {
  device("Mozilla/5.0 Windows NT 10.0");
  const close = pairingQr(uri, vi.fn());
  expect(document.querySelector("details")!.open).toBe(true);
  expect(document.querySelector("canvas")).toBeTruthy();
  close();
});
