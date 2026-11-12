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
  approvalWifStatus,
} from "@/lib/wif/payments.functions";
import {
  approveWif,
  payWif,
  assertWifWallet,
  changeWifWallet,
  connectWifWallet,
} from "@/lib/wif/wallet";
import { type WifQuote } from "@/lib/wif/config";
import type { Intention } from "@/lib/manifest";
import { paymentTestAccess } from "@/lib/wif/test-access";

function paymentError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Request unresolved. Check payment status.";
  return /429|Too Many Requests|Chain is busy/i.test(message)
    ? "Robinhood Chain is busy. Wait one minute, then check again. Do not resend a pending payment."
    : message;
}

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
  const approval = useServerFn(approvalWifStatus);
  const [approved, setApproved] = useState(false);
  const [walletChecked, setWalletChecked] = useState(false);
  const [payer, setPayer] = useState<string>();
  const [q, setQ] = useState<WifQuote | null>(null),
    [ready, setReady] = useState(false);
  const [approvalRequested, setApprovalRequested] = useState(false);
  useEffect(() => {
    setApproved(false);
    setApprovalRequested(false);
  }, [q?.id]);
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
          setPayer(a.links.find((link) => link.purpose === "payer")?.address);
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
        if (active) setMessage(paymentError(e));
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
      setWalletChecked(false);
      setApproved(false);
      setMessage(paymentError(e));
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
  async function verifyApproval(quote: WifQuote) {
    const status = await approval({ data: { id: quote.id } });
    setApproved(status.approved && !status.expired);
    setMessage(
      status.expired
        ? "Quote expired. Refresh it before continuing."
        : status.approved
          ? "WIF spending approval confirmed. You can now review the payment in your wallet."
          : "WIF approval is not confirmed yet. Review the approval in your wallet, return here, then check again. No payment has been sent.",
    );
  }
  async function connectPayer() {
    if (q) {
      await assertWifWallet(q);
      setWalletChecked(true);
      await verifyApproval(q);
    } else {
      const address = await connectWifWallet();
      if (!payer || address.toLowerCase() !== payer.toLowerCase())
        throw new Error(
          `Connected wallet: ${address}. Your verified paying wallet is ${payer || "not set"}. Select that account, or verify a new payer in Account.`,
        );
      setWalletChecked(true);
      setMessage("Paying wallet connected on Robinhood Chain. Request a fresh quote when ready.");
    }
  }
  return (
    <section className="space-y-3 rounded-sm border p-4 [&_button]:w-full [&_button]:whitespace-normal">
      <p className="eyebrow">Unseal with $WIF</p>
      <a className="block text-xs text-gold underline" href="/wallet-setup">Set up phone network</a>
      {q?.status !== "pending" && (
        <>
          <p className="break-all text-xs">
            Paying wallet: {q?.sender || payer || "Verify a payer in Account first"}
          </p>
          <Button variant="outline" disabled={busy || !ready} onClick={() => run(connectPayer)}>
            {walletChecked ? "Check paying wallet" : "Connect paying wallet"}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await changeWifWallet();
                setWalletChecked(false);
                setApproved(false);
                setMessage(
                  "Previous connection closed. Connect the app holding your paying wallet.",
                );
              })
            }
          >
            Change wallet app
          </Button>
        </>
      )}
      {!eligible && !q && (
        <p className="text-sm text-muted-foreground">
          Paid checkout is currently limited to the launch-test wallet. Complimentary unsealings
          remain available.
        </p>
      )}
      {!q ? (
        <Button
          disabled={!ready || !eligible || !intention || busy || !walletChecked}
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
                disabled={busy || !walletChecked || approved || approvalRequested}
                onClick={() =>
                  run(async () => {
                    await assertWifWallet(q);
                    const h = await approveWif(q);
                    setApprovalRequested(true);
                    setMessage(
                      `Approval submitted: ${h}. Wait for confirmation, then pay. Approval does not unseal or transfer WIF.`,
                    );
                    await verifyApproval(q);
                  })
                }
              >
                1. Approve exact WIF amount
              </Button>
              <Button
                variant="outline"
                disabled={busy || !walletChecked}
                onClick={() =>
                  run(async () => {
                    await assertWifWallet(q);
                    await verifyApproval(q);
                  })
                }
              >
                Check WIF approval
              </Button>
              <Button
                disabled={busy || !walletChecked || !approved}
                onClick={() =>
                  run(async () => {
                    await assertWifWallet(q);
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
