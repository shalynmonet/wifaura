import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { formatUnits } from "viem";
import { Button } from "./ui/button";
import {
  wifAccount,
  quoteWif,
  prepareWif,
  checkWif,
  releaseWif,
} from "@/lib/wif/payments.functions";
import { approveWif, payWif } from "@/lib/wif/wallet";
import { type WifQuote } from "@/lib/wif/config";
import type { Intention } from "@/lib/manifest";
import { paymentTestAccess } from "@/lib/wif/test-access";

export function WifPaymentPanel(props: {
  dropId: string;
  intention: Intention | null;
  onFulfilled: (id: string) => void;
}) {
  if (import.meta.env["VITE_WIFAURA_PAYMENTS_ENABLED"] === "false")
    return (
      <section className="space-y-3 rounded-sm border p-4">
        <p className="eyebrow">Unseal with $WIF</p>
        <p className="text-sm text-muted-foreground">
          Paid unsealings are not open yet. Your Vault and Collective progress remain available.
        </p>
      </section>
    );
  return <ActiveWifPaymentPanel {...props} />;
}

function ActiveWifPaymentPanel({
  dropId,
  intention,
  onFulfilled,
}: {
  dropId: string;
  intention: Intention | null;
  onFulfilled: (id: string) => void;
}) {
  const account = useServerFn(wifAccount),
    quote = useServerFn(quoteWif),
    prepare = useServerFn(prepareWif),
    check = useServerFn(checkWif);
  const release = useServerFn(releaseWif);
  const [q, setQ] = useState<WifQuote | null>(null),
    [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [hash, setHash] = useState("");
  const lock = useRef(false);
  const [eligible, setEligible] = useState(!import.meta.env["VITE_WIFAURA_TEST_PAYER"]);
  useEffect(() => {
    let active = true;
    account()
      .then((a) => {
        if (active) {
          setEligible(
            paymentTestAccess(
              import.meta.env["VITE_WIFAURA_TEST_PAYER"],
              a.links.find((link) => link.purpose === "payer")?.address,
            ),
          );
          setQ(
            a.quotes.find(
              (x) =>
                x.status === "pending" ||
                (x.status === "quoted" && Date.parse(x.expires_at) > Date.now()),
            ) ?? null,
          );
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, [account]);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request unresolved. Check payment status.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function verify() {
    if (!q) return;
    const next = await check({ data: { id: q.id, ...(hash ? { hash } : {}) } });
    setQ(next);
    if (next.status === "fulfilled" && next.manifestation_id) {
      setMessage("Payment and 50% Reserve delivery verified.");
      onFulfilled(next.manifestation_id);
    } else setMessage("Payment awaits chain finality. Check again later; do not pay again.");
  }
  return (
    <section className="space-y-3 rounded-sm border p-4">
      <p className="eyebrow">Unseal with $WIF</p>
      {!eligible && !q && (
        <p className="text-sm text-muted-foreground">
          Paid checkout is currently limited to the launch-test wallet. Complimentary unsealings
          remain available.
        </p>
      )}
      {!q ? (
        <Button
          disabled={!ready || !eligible || !intention || busy}
          onClick={() =>
            run(async () => {
              if (intention) {
                setQ(await quote({ data: { dropId, intention } }));
                setMessage("Review this quote before approving tokens.");
              }
            })
          }
        >
          Get WIF quote
        </Button>
      ) : (
        <>
          <p>$1.00 in WIF · {formatUnits(BigInt(q.amount), q.decimals)} WIF</p>
          <p className="text-xs">Quoted intention: {q.intention}</p>
          <p className="text-xs text-muted-foreground">
            50% to your Reserve · 50% to WIFAURA. WIF amount is locked at the quoted $1 rate until
            expiry. Network fees use ETH; WIF's market value can change.
          </p>
          {q.wif_usd_rate && (
            <p className="text-xs text-muted-foreground">
              Rate: ${q.wif_usd_rate} per WIF · DEX Screener ·{" "}
              {q.rate_observed_at && new Date(q.rate_observed_at).toLocaleString()}
            </p>
          )}
          <p className="break-all text-xs">Reserve: {q.reserve}</p>
          <p className="text-xs">Expires: {new Date(q.expires_at).toLocaleString()}</p>
          {q.status === "quoted" ? (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const h = await approveWif(q);
                    setMessage(
                      `Approval submitted: ${h}. Wait for confirmation, then pay. Approval does not unseal or transfer WIF.`,
                    );
                  })
                }
              >
                1. Approve exact WIF amount
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const pending = await prepare({ data: { id: q.id } });
                    setQ(pending);
                    setMessage(
                      "Approve payment in your wallet. If interrupted, use Check payment.",
                    );
                    const h = await payWif(pending);
                    setHash(h);
                    setMessage("Payment submitted. Check payment for finalized verification.");
                  })
                }
              >
                2. Pay and unseal
              </Button>
            </>
          ) : q.status === "pending" ? (
            <>
              <p className="text-xs text-muted-foreground">
                Pending until verified, including after a cancelled or timed-out wallet request.
                Checking never sends funds.
              </p>
              <input
                aria-label="Payment transaction hash"
                className="w-full border bg-card p-2 text-xs"
                placeholder="Optional 0x transaction hash for recovery"
                value={hash}
                onChange={(e) => setHash(e.target.value)}
              />
              <Button disabled={busy} onClick={() => run(verify)}>
                Check payment
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await release({ data: { id: q.id } });
                    setQ(null);
                    setHash("");
                    setMessage(
                      "Finalized chain evidence confirms no payment. You may request a new quote.",
                    );
                  })
                }
              >
                Release after verified expiry
              </Button>
            </>
          ) : (
            <p>Verified payment</p>
          )}
        </>
      )}
      {q?.status === "quoted" && (
        <Button
          variant="outline"
          disabled={busy || !intention}
          onClick={() =>
            run(async () => {
              if (intention) setQ(await quote({ data: { dropId, intention } }));
            })
          }
        >
          Refresh expired quote
        </Button>
      )}
      <p role="status" className="break-words text-xs text-muted-foreground">
        {message}
      </p>
    </section>
  );
}
