import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WalletPanel } from "./WalletPanel";
const m = vi.hoisted(() => ({
  account: vi.fn(),
  challenge: vi.fn(),
  link: vi.fn(),
  connect: vi.fn(),
  sign: vi.fn(),
  change: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/wif/payments.functions", () => ({
  wifAccount: m.account,
  walletChallenge: m.challenge,
  linkWallet: m.link,
}));
vi.mock("@/lib/wif/wallet", () => ({
  connectWifWallet: m.connect,
  signWifMessage: m.sign,
  changeWifWallet: m.change,
}));
const payer = "0x1111111111111111111111111111111111111111";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VITE_WIFAURA_PAYMENTS_ENABLED", "true");
  m.account.mockResolvedValue({ links: [{ purpose: "payer", address: payer }], quotes: [] });
  m.connect.mockResolvedValue(payer);
  m.change.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
function show() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WalletPanel />
    </QueryClientProvider>,
  );
}
it("does not request a signature to reuse the payer as Reserve", async () => {
  show();
  await screen.findByText(`payer: ${payer}`);
  fireEvent.click(screen.getByText("Verify Reserve wallet"));
  await screen.findByText(/Paying and Reserve wallets must be different/);
  expect(m.challenge).not.toHaveBeenCalled();
  expect(m.sign).not.toHaveBeenCalled();
  expect(m.link).not.toHaveBeenCalled();
});
it("lets a phone user reconnect the other account without deleting verified links", async () => {
  show();
  await screen.findByText(`payer: ${payer}`);
  fireEvent.click(screen.getByText("Change wallet or account"));
  await waitFor(() => expect(m.change).toHaveBeenCalledTimes(1));
  expect(m.link).not.toHaveBeenCalled();
  expect(screen.getByText(`payer: ${payer}`)).toBeTruthy();
});
