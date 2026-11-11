import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { WifPaymentPanel } from "./WifPaymentPanel";
const m = vi.hoisted(() => ({
  account: vi.fn(),
  quote: vi.fn(),
  prepare: vi.fn(),
  check: vi.fn(),
  release: vi.fn(),
  approve: vi.fn(),
  pay: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/wif/payments.functions", () => ({
  wifAccount: m.account,
  quoteWif: m.quote,
  prepareWif: m.prepare,
  checkWif: m.check,
  releaseWif: m.release,
}));
vi.mock("@/lib/wif/wallet", () => ({ approveWif: m.approve, payWif: m.pay }));
const q = {
  id: "q",
  quote_key: "0x" + "a".repeat(64),
  sender: "0x" + "1".repeat(40),
  reserve: "0x" + "2".repeat(40),
  router: "0x" + "3".repeat(40),
  treasury: "0x" + "4".repeat(40),
  amount: "1000",
  decimals: 18,
  expires_at: "2030-01-01",
  status: "quoted",
  tx_hash: null,
  manifestation_id: null,
};
beforeEach(() => {
  vi.stubEnv('VITE_WIFAURA_PAYMENTS_ENABLED', 'true');
  vi.resetAllMocks();
  m.account.mockResolvedValue({ quotes: [q], links: [] });
  m.prepare.mockResolvedValue({ ...q, status: "pending" });
  m.pay.mockResolvedValue("0x" + "b".repeat(64));
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
it('does not open a wallet or request payment state while paid checkout is disabled', () => {
  vi.stubEnv('VITE_WIFAURA_PAYMENTS_ENABLED', 'false');
  render(<WifPaymentPanel dropId="drop" intention="become" onFulfilled={() => {}} />);
  expect(screen.getByText(/Paid unsealings are not open yet/)).toBeTruthy();
  expect(m.account).not.toHaveBeenCalled();
  expect(m.pay).not.toHaveBeenCalled();
});
it("opens only one wallet payment when clicked twice", async () => {
  render(<WifPaymentPanel dropId="drop" intention="become" onFulfilled={() => {}} />);
  const button = await screen.findByText("2. Pay and unseal");
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(m.pay).toHaveBeenCalledTimes(1));
  expect(m.prepare).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("2. Pay and unseal")).toBeNull();
});
it("keeps an ambiguous wallet send pending across reload, and checking never sends again", async () => {
  m.pay.mockRejectedValue(new Error("Wallet timed out"));
  const view = render(<WifPaymentPanel dropId="drop" intention="become" onFulfilled={() => {}} />);
  fireEvent.click(await screen.findByText("2. Pay and unseal"));
  await screen.findByText("Wallet timed out");
  view.unmount();
  m.account.mockResolvedValue({ quotes: [{ ...q, status: "pending" }], links: [] });
  m.check.mockResolvedValue({ ...q, status: "pending" });
  render(<WifPaymentPanel dropId="drop" intention="become" onFulfilled={() => {}} />);
  fireEvent.click(await screen.findByText("Check payment"));
  await waitFor(() => expect(m.check).toHaveBeenCalledTimes(1));
  expect(m.pay).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("2. Pay and unseal")).toBeNull();
});
it("reveals only after server fulfillment and never after token approval alone", async () => {
  const fulfilled = vi.fn();
  m.approve.mockResolvedValue("0x" + "c".repeat(64));
  render(<WifPaymentPanel dropId="drop" intention="become" onFulfilled={fulfilled} />);
  fireEvent.click(await screen.findByText("1. Approve exact WIF amount"));
  await waitFor(() => expect(m.approve).toHaveBeenCalledTimes(1));
  expect(fulfilled).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByText("2. Pay and unseal"));
  const check = await screen.findByText("Check payment");
  m.check.mockResolvedValue({ ...q, status: "fulfilled", manifestation_id: "manifestation" });
  await waitFor(() => expect(check).not.toBeDisabled());
  fireEvent.click(check);
  await waitFor(() => expect(fulfilled).toHaveBeenCalledWith("manifestation"));
});
