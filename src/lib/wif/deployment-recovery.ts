export function requireUnusedDeploymentNonce(latest: number, pending: number, nonce: number) {
  if (!Number.isSafeInteger(nonce) || nonce < 0 || latest !== nonce || pending !== nonce)
    throw new Error(
      "An outgoing transaction exists or the wallet nonce changed. Check wallet activity before another deployment.",
    );
  return nonce;
}
