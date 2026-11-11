export function authErrorMessage(error: unknown) {
  const value =
    error && typeof error === "object"
      ? (error as { code?: string; message?: string; status?: number })
      : {};
  if (value.code === "email_address_invalid")
    return "This email address was not accepted. Check the spelling and use your usual email address.";
  if (value.code === "email_address_not_authorized")
    return "Confirmation email is not available for this address yet. Use Google sign-in when available.";
  if (
    value.code === "over_email_send_rate_limit" ||
    value.message?.toLowerCase().includes("email rate limit")
  )
    return "Confirmation emails are temporarily unavailable. Check your inbox for an earlier confirmation, or use Google sign-in when available. Repeated signup attempts will not fix this.";
  if (value.code === "email_not_confirmed")
    return "Confirm your email using the message in your inbox, then sign in.";
  if (value.code === "invalid_credentials")
    return "The email or password was not accepted. If you just signed up, check for a confirmation email first.";
  return value.message || "Sign-in could not be completed. Please try again later.";
}
