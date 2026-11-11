import { expect, it } from "vitest";
import { authErrorMessage } from "./auth-errors";
it("distinguishes rejected email, unavailable delivery and login errors", () => {
  expect(authErrorMessage({ code: "email_address_invalid" })).toMatch(/spelling/);
  expect(authErrorMessage({ code: "email_address_not_authorized" })).toMatch(
    /not available for this address/,
  );
  expect(authErrorMessage({ code: "over_email_send_rate_limit" })).toMatch(
    /Repeated signup attempts/,
  );
  expect(authErrorMessage({ code: "email_not_confirmed" })).toMatch(/Confirm your email/);
  expect(authErrorMessage({ code: "invalid_credentials" })).toMatch(/email or password/);
});
it("does not mislabel email rate limiting as a problem with the address", () => {
  const message = authErrorMessage({ message: "email rate limit exceeded" });
  expect(message).toMatch(/temporarily unavailable/);
  expect(message).not.toMatch(/invalid|spelling/);
  expect(authErrorMessage(null)).toMatch(/could not be completed/);
});
