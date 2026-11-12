import { expect, it } from "vitest";
import { requireUnusedDeploymentNonce } from "./deployment-recovery";

it("allows a retry only at the same unused nonce", () => {
  expect(requireUnusedDeploymentNonce(0, 0, 0)).toBe(0);
  expect(requireUnusedDeploymentNonce(7, 7, 7)).toBe(7);
});
it("blocks a mined, pending or changed nonce rather than deploying again", () => {
  for (const [latest, pending, nonce] of [
    [1, 1, 0],
    [0, 1, 0],
    [7, 8, 7],
    [6, 6, 7],
    [0, 0, -1],
  ]) {
    expect(() => requireUnusedDeploymentNonce(latest!, pending!, nonce!)).toThrow(
      /outgoing transaction/,
    );
  }
});
