// @vitest-environment node
import { encodeAbiParameters, encodeEventTopics, type Hash } from "viem";
import { it, expect, vi } from "vitest";
import { matchingPayment, verifyReceiptEvidence } from "./rpc.server";
import { paymentAbi, type WifQuote } from "./config";
import { assertSeparateBackend, ORIGINAL_BACKEND } from "./isolation";
const q: WifQuote = {
  id: "q",
  intention: "become",
  drop_id: "drop",
  quote_key: `0x${"a".repeat(64)}`,
  sender: `0x${"1".repeat(40)}`,
  reserve: `0x${"2".repeat(40)}`,
  router: `0x${"3".repeat(40)}`,
  treasury: `0x${"4".repeat(40)}`,
  amount: "1000",
  decimals: 18,
  expires_at: "2030-01-01",
  status: "pending",
  tx_hash: null,
  manifestation_id: null,
};
function log(amount = 1000n, share = 500n) {
  return {
    address: q.router,
    topics: encodeEventTopics({
      abi: paymentAbi,
      eventName: "Paid",
      args: { quoteId: q.quote_key, payer: q.sender, reserve: q.reserve },
    }) as Hash[],
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [amount, share]),
  };
}
it("requires exact router, quote, payer, reserve, amount and half-share evidence", () => {
  expect(matchingPayment(log(), q)).toBe(true);
  expect(matchingPayment({ ...log(), address: q.treasury }, q)).toBe(false);
  expect(matchingPayment({ ...log(), removed: true }, q)).toBe(false);
  expect(matchingPayment(log(1000n, 499n), q)).toBe(false);
  expect(matchingPayment(log(100n, 50n), q)).toBe(false);
  expect(matchingPayment(log(), { ...q, quote_key: `0x${"b".repeat(64)}` })).toBe(false);
  expect(matchingPayment(log(), { ...q, sender: q.reserve })).toBe(false);
  expect(matchingPayment(log(), { ...q, reserve: q.sender })).toBe(false);
});
it("blocks inherited production backend even when a different path is supplied", () => {
  expect(() => assertSeparateBackend(ORIGINAL_BACKEND + "/rest/v1")).toThrow(/cannot connect/);
  expect(() => assertSeparateBackend("http://127.0.0.1:54321")).not.toThrow();
});
it("requires a successful canonical finalized receipt, rejecting reorgs, wrong sender and late payments", async () => {
  const hash = `0x${"c".repeat(64)}` as Hash,
    blockHash = `0x${"d".repeat(64)}` as Hash;
  const time = BigInt(Math.floor(Date.parse("2029-01-01") / 1000));
  const receipt = {
    status: "success",
    to: q.router,
    from: q.sender,
    transactionHash: hash,
    blockNumber: 100n,
    blockHash,
    logs: [log()],
  };
  const block = { number: 100n, hash: blockHash, timestamp: time };
  const receiptFn = vi.fn(async () => receipt),
    blockFn = vi.fn(async () => block);
  const client = { getTransactionReceipt: receiptFn, getBlock: blockFn } as unknown as Parameters<
    typeof verifyReceiptEvidence
  >[0];
  expect(await verifyReceiptEvidence(client, q, hash, "2028-12-31")).toEqual({
    block: "100",
    blockHash,
  });
  blockFn.mockImplementation(async (input?: unknown) =>
    (input as { blockTag?: string })?.blockTag === "finalized" ? { ...block, number: 99n } : block,
  );
  expect(await verifyReceiptEvidence(client, q, hash, "2028-12-31")).toBeNull();
  blockFn.mockImplementation(async () => ({ ...block, hash: `0x${"e".repeat(64)}` }));
  await expect(verifyReceiptEvidence(client, q, hash, "2028-12-31")).rejects.toThrow(/canonical/);
  blockFn.mockImplementation(async () => block);
  receiptFn.mockImplementation(async () => ({ ...receipt, status: "reverted" }));
  await expect(verifyReceiptEvidence(client, q, hash, "2028-12-31")).rejects.toThrow(/successful/);
  receiptFn.mockImplementation(async () => ({ ...receipt, from: q.reserve }));
  await expect(verifyReceiptEvidence(client, q, hash, "2028-12-31")).rejects.toThrow(/successful/);
  receiptFn.mockImplementation(async () => receipt);
  await expect(
    verifyReceiptEvidence(client, { ...q, expires_at: "2028-01-01" }, hash, "2027-01-01"),
  ).rejects.toThrow(/window/);
  blockFn
    .mockResolvedValueOnce(block)
    .mockResolvedValueOnce(block)
    .mockResolvedValueOnce({ ...block, hash: `0x${"e".repeat(64)}` });
  await expect(verifyReceiptEvidence(client, q, hash, "2028-12-31")).rejects.toThrow(/changed/);
});
