import { isAddress } from "viem";

// Optional launch restriction. Actual payer must come from a server-verified
// wallet link or durable quote, never from request input.
export function paymentTestAccess(allowed: string | undefined, payer: string | undefined) {
  if (!allowed) return true;
  return isAddress(allowed) && !!payer && allowed.toLowerCase() === payer.toLowerCase();
}
