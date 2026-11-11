import { createClient } from "@supabase/supabase-js";
import { assertSeparateBackend } from "./isolation";

// New WIFAURA tables have their own types; inherited generated Nimiq types remain untouched.
export function wifStore() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Configure a separate WIFAURA backend.");
  assertSeparateBackend(url);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
