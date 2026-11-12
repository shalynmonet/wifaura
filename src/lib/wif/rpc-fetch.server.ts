// One queue per endpoint in this Worker instance. Never retries or broadcasts.
export function pacedRpcFetch(send: typeof fetch = fetch) {
  let tail: Promise<unknown> = Promise.resolve();
  let next = 0;
  let blockedUntil = 0;
  return (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const task = tail.then(async () => {
      if (Date.now() < blockedUntil)
        throw new Error(
          "Robinhood Chain is busy. Wait one minute, then check again. Do not resend a pending payment.",
        );
      const delay = next - Date.now();
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      init?.signal?.throwIfAborted();
      next = Date.now() + 1000;
      const response = await send(input, init);
      if (response.status === 429) {
        const seconds = Number(response.headers.get("retry-after"));
        const date = Date.parse(response.headers.get("retry-after") || "");
        blockedUntil = Math.max(
          Date.now() + 60_000,
          Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Number.isFinite(date) ? date : 0,
        );
        await response.body?.cancel();
        throw new Error(
          "Robinhood Chain is busy. Wait one minute, then check again. Do not resend a pending payment.",
        );
      }
      return response;
    });
    tail = task.catch(() => undefined);
    return task;
  };
}
const endpoints = new Map<string, ReturnType<typeof pacedRpcFetch>>();
export function rpcFetch(url: string) {
  let send = endpoints.get(url);
  if (!send) {
    send = pacedRpcFetch();
    endpoints.set(url, send);
  }
  return send;
}
