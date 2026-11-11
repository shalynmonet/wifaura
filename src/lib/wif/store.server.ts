import { createClient } from "@supabase/supabase-js";
import { assertSeparateBackend } from "./isolation";

// New WIFAURA tables have their own types; inherited generated Nimiq types remain untouched.
export function wifStore() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SECRET_KEY"] || process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("Configure a separate WIFAURA backend.");
  assertSeparateBackend(url);
  return createClient(url, key, {
    global: { fetch: protectedBackendFetch(url, key) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function protectedBackendFetch(
  url: string,
  key: string,
  request: typeof fetch = fetch,
): typeof fetch {
  const origin = new URL(url).origin;
  if (new URL(url).protocol !== "https:") throw new Error("HTTPS backend required.");
  return (input, init) => {
    const target =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (new URL(target).origin !== origin)
      throw new Error("Backend credential destination mismatch.");
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
    if (key.startsWith("sb_secret_") && headers.get("Authorization") === `Bearer ${key}`)
      headers.delete("Authorization");
    headers.set("apikey", key);
    return request(input, { ...init, headers, redirect: "manual" });
  };
}
