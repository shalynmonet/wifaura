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
  assert: vi.fn(),
  connect: vi.fn(),
  change: vi.fn(),
  approvalStatus: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/wif/payments.functions", () => ({
  wifAccount: m.account,
  quoteWif: m.quote,
  prepareWif: m.prepare,
  checkWif: m.check,
  releaseWif: m.release,
  approvalWifStatus: m.approvalStatus,
}));
vi.mock("@/lib/wif/wallet", () => ({
  approveWif: m.approve,
  payWif: m.pay,
  assertWifWallet: m.assert,
  connectWifWallet: m.connect,
  changeWifWallet: m.change,
}));
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
  vi.stubEnv("VITE_WIFAURA_PAYMENTS_ENABLED", "true");
  vi.stubEnv("VITE_WIFAURA_TEST_PAYER", "");
  vi.resetAllMocks();
  m.account.mockResolvedValue({ quotes: [q], links: [] });
  m.prepare.mockResolvedValue({ ...q, status: "pending" });
  m.pay.mockResolvedValue("0x" + "b".repeat(64));
  m.assert.mockResolvedValue(undefined);
  m.connect.mockResolvedValue(q.sender);
  m.approvalStatus.mockResolvedValue({ approved: true, expired: false });
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
it("does not open a wallet or request payment state while paid checkout is disabled", () => {
  vi.stubEnv("VITE_WIFAURA_PAYMENTS_ENABLED", "false");
  render(<WifPaymentPanel dropId="drop" intention="become" onFulfilled={() => {}} />);
  expect(screen.getByText(/Paid unsealings are not open yet/)).toBeTruthy();
  expect(m.account).not.toHaveBeenCalled();
  expect(m.pay).not.toHaveBeenCalled();
});
it("blocks new quotes for wallets outside the launch test", async () => {
  vi.stubEnv("VITE_WIFAURA_TEST_PAYER", q.sender);
  m.account.mockResolvedValue({ quotes: [], links: [] });
  render(<WifPaymentPanel dropId="drop" intention="become" onFulfilled={() => {}} />);
  await screen.findByText(/limited to the launch-test wallet/);
  expect(screen.getByText("Get WIF quote")).toBeDisabled();
  expect(m.quote).not.toHaveBeenCalled();
  expect(m.pay).not.toHaveBeenCalled();
});
it("allows a verified launch payer to request a quote", async () => {
  vi.stubEnv("VITE_WIFAURA_TEST_PAYER", q.sender);
  m.account.mockResolvedValue({ quotes: [], links: [{ purpose: "payer", address: q.sender }] });
  m.quote.mockResolvedValue(q);
  render(<WifPaymentPanel dropId="drop" intention="become" onFulfilled={() => {}} />);
  const button = screen.getByText("Get WIF quote");
  fireEvent.click(await screen.findByText("Connect paying wallet"));
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
  await waitFor(() => expect(m.quote).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByText("1. Approve exact WIF amount")).not.toBeDisabled());
  expect(screen.getByText("2. Pay and unseal")).toBeDisabled();
  expect(m.pay).not.toHaveBeenCalled();
});
it("shows a clear rate-limit message without suggesting another payment", async () => {
  m.account.mockRejectedValue(
    new Error("RPC Request failed. Status: 429 Request body: private-debug-details"),
  );
  render(<WifPaymentPanel dropId="drop" intention="become" onFulfilled={() => {}} />);
  await screen.findByText(/Robinhood Chain is busy/);
  expect(screen.queryByText(/private-debug-details/)).toBeNull();
  expect(m.pay).not.toHaveBeenCalled();
});
it("opens only one wallet payment when clicked twice", async () => {
  render(<WifPaymentPanel dropId="drop" intention="become" onFulfilled={() => {}} />);
  const button = await screen.findByText("2. Pay and unseal");
  fireEvent.click(await screen.findByText("Connect paying wallet"));
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(m.pay).toHaveBeenCalledTimes(1));
  expect(m.prepare).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("2. Pay and unseal")).toBeNull();
});
it("keeps an ambiguous wallet send pending across reload, and checking never sends again", async () => {
  m.pay.mockRejectedValue(new Error("Wallet timed out"));
  const view = render(<WifPaymentPanel dropId="drop" intention="become" onFulfilled={() => {}} />);
  fireEvent.click(await screen.findByText("Connect paying wallet"));
  await waitFor(() => expect(screen.getByText("2. Pay and unseal")).not.toBeDisabled());
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
  m.approvalStatus
    .mockResolvedValueOnce({ approved: false, expired: false })
    .mockResolvedValue({ approved: true, expired: false });
  render(<WifPaymentPanel dropId="drop" intention="become" onFulfilled={fulfilled} />);
  fireEvent.click(await screen.findByText("Connect paying wallet"));
  await waitFor(() => expect(screen.getByText("1. Approve exact WIF amount")).not.toBeDisabled());
  fireEvent.click(await screen.findByText("1. Approve exact WIF amount"));
  await waitFor(() => expect(m.approve).toHaveBeenCalledTimes(1));
  expect(fulfilled).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByText("2. Pay and unseal")).not.toBeDisabled());
  fireEvent.click(await screen.findByText("2. Pay and unseal"));
  const check = await screen.findByText("Check payment");
  m.check.mockResolvedValue({ ...q, status: "fulfilled", manifestation_id: "manifestation" });
  await waitFor(() => expect(check).not.toBeDisabled());
  fireEvent.click(check);
  await waitFor(() => expect(fulfilled).toHaveBeenCalledWith("manifestation"));
});
it("blocks payment until the correct payer and onchain allowance are confirmed", async () => {
  m.approvalStatus.mockResolvedValue({ approved: false, expired: false });
  render(<WifPaymentPanel dropId="drop" intention="become" onFulfilled={() => {}} />);
  const pay = await screen.findByText("2. Pay and unseal");
  expect(pay).toBeDisabled();
  m.assert.mockRejectedValueOnce(new Error("Wrong payer selected"));
  fireEvent.click(screen.getByText("Connect paying wallet"));
  await screen.findByText("Wrong payer selected");
  expect(m.approvalStatus).not.toHaveBeenCalled();
  expect(m.prepare).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Connect paying wallet"));
  await screen.findByText(/WIF approval is not confirmed/);
  expect(pay).toBeDisabled();
  m.approvalStatus.mockResolvedValue({ approved: true, expired: false });
  fireEvent.click(screen.getByText("Check WIF approval"));
  await waitFor(() => expect(pay).not.toBeDisabled());
  m.assert.mockRejectedValueOnce(new Error("Wallet changed before payment"));
  fireEvent.click(pay);
  await screen.findByText("Wallet changed before payment");
  expect(m.prepare).not.toHaveBeenCalled();
  expect(m.pay).not.toHaveBeenCalled();
});
