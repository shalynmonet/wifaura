import { afterEach, expect, it, vi } from "vitest";
import { mobileWalletRequest } from "./mobile-wallet";
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
function phone() {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("iPhone");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: vi.fn(),
  });
}
it("keeps one request alive through a phone app round trip and closes instructions on response", async () => {
  phone();
  let resolve!: (value: string) => void;
  const send = vi.fn(
    () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  );
  const pending = mobileWalletRequest(send, "MetaMask", "eth_sendTransaction");
  expect(document.querySelector("a")!.getAttribute("href")).toBe("metamask://");
  document.dispatchEvent(new Event("visibilitychange"));
  document.dispatchEvent(new Event("visibilitychange"));
  expect(send).toHaveBeenCalledTimes(1);
  resolve("hash");
  expect(await pending).toBe("hash");
  expect(document.querySelector("dialog")).toBeNull();
});
it("closes a rejected signing request without retrying", async () => {
  phone();
  const send = vi.fn().mockRejectedValue(new Error("Rejected"));
  await expect(mobileWalletRequest(send, "Robinhood Wallet", "personal_sign")).rejects.toThrow(
    "Rejected",
  );
  expect(send).toHaveBeenCalledTimes(1);
  expect(document.querySelector("dialog")).toBeNull();
});
