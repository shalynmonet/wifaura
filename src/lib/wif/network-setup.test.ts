import { expect, it, vi } from "vitest";
import type { EIP1193Provider } from "viem";
import { setupRobinhoodNetwork } from "./network-setup";
it("adds only the official network when missing, switches and verifies it without signing or sending", async () => {
  let chain = "0x1",
    added = false;
  const request = vi.fn(async ({ method, params }: { method: string; params?: unknown[] }) => {
    if (method === "eth_chainId") return chain;
    if (method === "wallet_switchEthereumChain") {
      if (!added) throw Object.assign(new Error("Missing"), { code: 4902 });
      chain = "0x1237";
      return null;
    }
    if (method === "wallet_addEthereumChain") {
      expect(params).toMatchObject([
        { chainId: "0x1237", rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"] },
      ]);
      added = true;
      return null;
    }
    throw new Error("Unexpected request");
  });
  await setupRobinhoodNetwork({
    request: request as EIP1193Provider["request"],
    on: vi.fn(),
    removeListener: vi.fn(),
  });
  expect(request.mock.calls.map(([r]) => r.method)).toEqual([
    "eth_chainId",
    "wallet_switchEthereumChain",
    "wallet_addEthereumChain",
    "wallet_switchEthereumChain",
    "eth_chainId",
  ]);
});
it("does not retry a rejected network prompt or send funds", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce("0x1")
    .mockRejectedValueOnce(Object.assign(new Error("Rejected"), { code: 4001 }));
  await expect(
    setupRobinhoodNetwork({
      request: request as EIP1193Provider["request"],
      on: vi.fn(),
      removeListener: vi.fn(),
    }),
  ).rejects.toThrow("Rejected");
  expect(request).toHaveBeenCalledTimes(2);
});
it("keeps an already correct network unchanged", async () => {
  const request = vi.fn().mockResolvedValue("0x1237");
  await setupRobinhoodNetwork({
    request: request as EIP1193Provider["request"],
    on: vi.fn(),
    removeListener: vi.fn(),
  });
  expect(request).toHaveBeenCalledTimes(1);
});
