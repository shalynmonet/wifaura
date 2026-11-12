export const MARKET_URL =
  "https://api.dexscreener.com/latest/dex/pairs/robinhood/0x71ef4106340f0a3b9c19ec994eef4fc44a1d2513f38faac39d7636b156548c79";
// Authentication is performed by withSupabase before this fixed read-only handler.
export async function marketHandler(req: Request, request: typeof fetch = fetch) {
  if (req.method !== "GET" || new URL(req.url).search)
    return new Response("Unsupported request", { status: 405 });
  try {
    const response = await request(MARKET_URL, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(6500),
      headers: { Accept: "application/json", "User-Agent": "WIFAURA/1.0 live-USD-quote" },
    });
    if (response.status !== 200)
      return new Response("Live market unavailable", {
        status: response.status === 403 || response.status === 429 ? response.status : 503,
        headers: {
          "cache-control": "no-store",
          "x-wifaura-upstream-status": String(response.status),
          "retry-after": response.headers.get("retry-after") || "30",
        },
      });
    const text = await response.text();
    if (text.length > 64000 || !response.headers.get("content-type")?.includes("application/json"))
      return new Response("Invalid market response", { status: 502 });
    return new Response(text, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-wifaura-provider-date": response.headers.get("date") || "",
        "x-wifaura-provider-age": response.headers.get("age") || "0",
      },
    });
  } catch {
    return new Response("Live market unavailable", {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }
}
