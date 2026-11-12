import { expect, it } from "vitest";
import { paymentTestAccess } from "./test-access";
const allowed = "0xb6B05f072A361d149095f03FA904B544d7d1418f";
it("restricts the trial to the verified matching payer", () => {
  expect(paymentTestAccess(allowed, allowed.toLowerCase())).toBe(true);
  expect(paymentTestAccess(allowed, undefined)).toBe(false);
  expect(paymentTestAccess(allowed, "0x1111111111111111111111111111111111111111")).toBe(false);
});
it("fails closed for malformed trial configuration and opens only when the restriction is removed", () => {
  expect(paymentTestAccess("invalid", "invalid")).toBe(false);
  expect(paymentTestAccess(undefined, undefined)).toBe(true);
});
