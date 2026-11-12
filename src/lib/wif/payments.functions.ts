import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isAddress, getAddress, verifyMessage } from "viem";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { paymentTestAccess } from "./test-access";
import { newManifestationSnapshot, newSeed, INTENTIONS } from "@/lib/manifest";
import type { WifQuote } from "./config";

const address = z
  .string()
  .refine(isAddress)
  .transform((v) => getAddress(v));
const id = z.object({ id: z.string().uuid() });
export const walletChallenge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ address, purpose: z.enum(["payer", "reserve"]) }))
  .handler(async ({ data, context }) => {
    const { wifStore } = await import("./store.server");
    const db = wifStore();
    const recent = await db
      .from("wif_wallet_challenges")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gt("expires_at", new Date().toISOString());
    if (recent.error || (recent.count ?? 0) >= 10)
      throw new Error("Too many wallet challenges. Try again in five minutes.");
    const key = crypto.randomUUID();
    const expires = new Date(Date.now() + 5 * 60_000).toISOString();
    const origin = process.env["WIFAURA_ORIGIN"];
    if (!origin || new URL(origin).origin !== origin) throw new Error("Configure WIFAURA origin.");
    const message = `${origin} WIFAURA wallet ownership\nCollector: ${context.userId}\nAddress: ${data.address}\nChain ID: 4663\nPurpose: ${data.purpose}\nNonce: ${key}\nExpires: ${expires}\nOwnership only; no spending authorization.`;
    const result = await db
      .from("wif_wallet_challenges")
      .insert({ id: key, user_id: context.userId, ...data, message, expires_at: expires });
    if (result.error) throw new Error("Cannot prepare ownership challenge.");
    return { id: key, message };
  });
export const linkWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(id.extend({ signature: z.string().regex(/^0x[0-9a-f]+$/i) }))
  .handler(async ({ data, context }) => {
    const { wifStore } = await import("./store.server");
    const db = wifStore();
    const { data: c } = await db
      .from("wif_wallet_challenges")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (!c || c.consumed_at || Date.parse(c.expires_at) <= Date.now())
      throw new Error("Challenge expired or consumed.");
    // EOA ownership only. Smart-account/1271 support must be implemented and tested separately.
    if (
      !(await verifyMessage({
        address: c.address,
        message: c.message,
        signature: data.signature as `0x${string}`,
      }))
    )
      throw new Error("Wallet signature does not match.");
    const result = await db.rpc("wif_consume_challenge", { _id: c.id, _user: context.userId });
    if (result.error) throw new Error("Wallet link could not be saved.");
    return true;
  });
export const wifAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { wifStore } = await import("./store.server");
    const db = wifStore();
    const [links, quotes] = await Promise.all([
      db.from("wif_wallet_links").select("address,purpose").eq("user_id", context.userId),
      db
        .from("wif_quotes")
        .select("*")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (links.error || quotes.error) throw new Error("WIFAURA account unavailable.");
    return {
      links: links.data as { address: `0x${string}`; purpose: string }[],
      quotes: quotes.data as WifQuote[],
    };
  });
export const quoteWif = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ dropId: z.string().uuid(), intention: z.enum(INTENTIONS) }))
  .handler(async ({ data, context }) => {
    const { paymentConfiguration } = await import("./rpc.server");
    const { wifStore } = await import("./store.server");
    const { liveDollarWifQuote } = await import("./price.server");
    const { marketRequest } = await import("./market-request.server");
    const db = wifStore();
    const allowed = process.env["WIFAURA_TEST_PAYER"];
    if (allowed) {
      const { data: payer, error } = await db
        .from("wif_wallet_links")
        .select("address")
        .eq("user_id", context.userId)
        .eq("purpose", "payer")
        .single();
      if (error || !paymentTestAccess(allowed, payer?.address))
        throw new Error("Paid checkout is currently limited to the verified launch-test wallet.");
    }
    const cfg = await paymentConfiguration();
    const pricing = await liveDollarWifQuote(cfg.decimals, marketRequest);
    const seed = newSeed();
    const result = await db.rpc("wif_create_quote", {
      _user: context.userId,
      _drop: data.dropId,
      _intention: data.intention,
      _seed: seed,
      _config: newManifestationSnapshot(seed, data.intention),
      _router: cfg.router,
      _treasury: cfg.treasury,
      _amount: pricing.amount,
      _rate: pricing.rate,
      _rate_source: pricing.source,
      _rate_observed_at: pricing.observedAt,
      _decimals: cfg.decimals,
      _key: `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) => x.toString(16).padStart(2, "0")).join("")}`,
      _start_block: (await cfg.client.getBlockNumber()).toString(),
    });
    if (result.error) throw new Error(result.error.message);
    if (!paymentTestAccess(allowed, (result.data as WifQuote).sender))
      throw new Error("Launch-test wallet changed. Reconnect the authorized payer.");
    return result.data as WifQuote;
  });
export const approvalWifStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(id)
  .handler(async ({ data, context }) => {
    const { wifStore } = await import("./store.server");
    const { paymentConfiguration } = await import("./rpc.server");
    const { erc20Abi } = await import("viem");
    const { WIF_TOKEN } = await import("./config");
    const { data: q } = await wifStore()
      .from("wif_quotes")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (!q || q.status !== "quoted") throw new Error("Quote unavailable. Check existing payment.");
    const cfg = await paymentConfiguration();
    if (
      q.router.toLowerCase() !== cfg.router.toLowerCase() ||
      q.treasury.toLowerCase() !== cfg.treasury.toLowerCase()
    )
      throw new Error("Quote deployment changed.");
    const allowance = await cfg.client.readContract({
      address: WIF_TOKEN,
      abi: erc20Abi,
      functionName: "allowance",
      args: [q.sender, q.router],
    });
    return {
      approved: allowance >= BigInt(q.amount),
      expired: Date.parse(q.expires_at) <= Date.now(),
    };
  });
export const prepareWif = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(id)
  .handler(async ({ data, context }) => {
    const { wifStore } = await import("./store.server");
    const { paymentConfiguration } = await import("./rpc.server");
    const { erc20Abi } = await import("viem");
    const { WIF_TOKEN } = await import("./config");
    const db = wifStore();
    const { data: q } = await db
      .from("wif_quotes")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (!q || q.status !== "quoted") throw new Error("Quote unavailable. Check existing payment.");
    if (!paymentTestAccess(process.env["WIFAURA_TEST_PAYER"], q.sender))
      throw new Error("Paid checkout is currently limited to the verified launch-test wallet.");
    const cfg = await paymentConfiguration();
    if (
      q.router.toLowerCase() !== cfg.router.toLowerCase() ||
      q.treasury.toLowerCase() !== cfg.treasury.toLowerCase()
    )
      throw new Error("Quote deployment changed.");
    const allowance = await cfg.client.readContract({
      address: WIF_TOKEN,
      abi: erc20Abi,
      functionName: "allowance",
      args: [q.sender, q.router],
    });
    if (allowance < BigInt(q.amount))
      throw new Error("Wait for the WIF approval to confirm before paying.");
    const result = await db
      .from("wif_quotes")
      .update({ status: "pending" })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("status", "quoted")
      .gt("expires_at", new Date().toISOString())
      .select("*")
      .single();
    if (result.error)
      throw new Error("Payment already started or expired. Check status; do not pay again.");
    return result.data as WifQuote;
  });
export const checkWif = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    id.extend({
      hash: z
        .string()
        .regex(/^0x[0-9a-f]{64}$/i)
        .optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { wifStore } = await import("./store.server");
    const { verifyWifPayment, chainClient } = await import("./rpc.server");
    const db = wifStore();
    const { data: q } = await db
      .from("wif_quotes")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (!q) throw new Error("Payment not found.");
    if (q.status === "fulfilled") return q as WifQuote;
    if (q.status !== "pending") throw new Error("Payment has not started.");
    let hash = data.hash as `0x${string}` | undefined;
    if (!hash) {
      // Durable recovery by indexed quote ID, even if a wallet timed out before returning a hash.
      const { paymentAbi } = await import("./config");
      const logs = await chainClient().getContractEvents({
        address: q.router,
        abi: paymentAbi,
        eventName: "Paid",
        args: { quoteId: q.quote_key, payer: q.sender },
        fromBlock: BigInt(q.start_block),
        toBlock: "latest",
      });
      const match = logs.length === 1 ? logs[0] : undefined;
      if (!match?.transactionHash)
        throw new Error(
          "Payment not found yet. Keep this purchase pending or enter its wallet transaction hash.",
        );
      hash = match.transactionHash;
    }
    const proof = await verifyWifPayment(q, hash, q.created_at);
    if (!proof) return q as WifQuote;
    const result = await db.rpc("wif_fulfill", {
      _id: q.id,
      _user: context.userId,
      _hash: hash.toLowerCase(),
      _block: proof.block,
      _block_hash: proof.blockHash,
    });
    if (result.error) throw new Error("Verified payment needs reconciliation. Do not pay again.");
    return result.data as WifQuote;
  });

// Release only after a finalized block beyond the contract-enforced deadline proves
// the sender/quote pair unused. Wallet cancellation alone is never sufficient.
export const releaseWif = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(id)
  .handler(async ({ data, context }) => {
    const { wifStore } = await import("./store.server");
    const { paymentConfiguration } = await import("./rpc.server");
    const { paymentAbi } = await import("./config");
    const db = wifStore();
    const { data: q } = await db
      .from("wif_quotes")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (!q || q.status !== "pending") throw new Error("Pending purchase required.");
    const { client, router } = await paymentConfiguration();
    if (router.toLowerCase() !== q.router.toLowerCase())
      throw new Error("Original payment contract required.");
    const finalized = await client.getBlock({ blockTag: "finalized" });
    if (
      finalized.number === null ||
      finalized.timestamp <= BigInt(Math.floor(Date.parse(q.expires_at) / 1000))
    )
      throw new Error("The payment window has not finalized yet. Check again later.");
    const paid = await client.readContract({
      address: q.router,
      abi: paymentAbi,
      functionName: "paid",
      args: [q.sender, q.quote_key],
      blockNumber: finalized.number,
    });
    if (paid || (await client.getBlock({ blockNumber: finalized.number })).hash !== finalized.hash)
      throw new Error("Payment may exist. Reconcile it; do not pay again.");
    const result = await db
      .from("wif_quotes")
      .update({ status: "expired" })
      .eq("id", q.id)
      .eq("user_id", context.userId)
      .eq("status", "pending")
      .select("id")
      .single();
    if (result.error) throw new Error("Purchase status changed. Check payment.");
    return true;
  });
