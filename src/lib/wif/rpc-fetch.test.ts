// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { pacedRpcFetch } from "./rpc-fetch.server";
afterEach(() => vi.useRealTimers());
it("spaces concurrent reads without dropping either request", async () => {
  vi.useFakeTimers();
  const send = vi.fn<typeof fetch>().mockImplementation(async () => new Response("{}"));
  const request = pacedRpcFetch(send);
  const one = request("https://rpc.example");
  const two = request("https://rpc.example");
  await vi.advanceTimersByTimeAsync(0);
  expect(send).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1000);
  await Promise.all([one, two]);
  expect(send).toHaveBeenCalledTimes(2);
});
it("honors a longer provider cooldown and never retries a throttled request", async () => {
  vi.useFakeTimers();
  const send = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "120" } }))
    .mockResolvedValue(new Response("{}"));
  const request = pacedRpcFetch(send);
  await expect(request("https://rpc.example")).rejects.toThrow("Chain is busy");
  await vi.advanceTimersByTimeAsync(60_000);
  await expect(request("https://rpc.example")).rejects.toThrow("Chain is busy");
  expect(send).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60_000);
  await request("https://rpc.example");
  expect(send).toHaveBeenCalledTimes(2);
});
