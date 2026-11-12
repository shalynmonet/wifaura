import { assertSeparateBackend } from "./isolation";
const SOURCE =
  "https://api.dexscreener.com/latest/dex/pairs/robinhood/0x71ef4106340f0a3b9c19ec994eef4fc44a1d2513f38faac39d7636b156548c79";
export function createMarketRequest(request: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const source =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (source !== SOURCE) throw new Error("Unapproved market source");
    if (process.env["WIFAURA_PRICE_RELAY_ENABLED"] !== "true") return request(input, init);
    const backend = process.env["SUPABASE_URL"] || "";
    assertSeparateBackend(backend);
    if (new URL(backend).protocol !== "https:") throw new Error("HTTPS backend required");
    const key = process.env["SUPABASE_SECRET_KEY"];
    if (!key?.startsWith("sb_secret_"))
      throw new Error("Protected market connection is not configured");
    const response = await request(`${new URL(backend).origin}/functions/v1/wif-market`, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      ...(init?.signal ? { signal: init.signal } : {}),
      headers: { apikey: key, Accept: "application/json" },
    });
    if (response.status !== 200) return response;
    // Preserve upstream observation time, never the relay's newer HTTP Date.
    const headers = new Headers(response.headers);
    headers.set("date", response.headers.get("x-wifaura-provider-date") || "");
    headers.set("age", response.headers.get("x-wifaura-provider-age") || "0");
    return new Response(response.body, { status: response.status, headers });
  };
}
export const marketRequest = createMarketRequest();
