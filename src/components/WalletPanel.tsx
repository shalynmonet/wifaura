import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { wifAccount, walletChallenge, linkWallet } from "@/lib/wif/payments.functions";
import { connectWifWallet, signWifMessage, changeWifWallet } from "@/lib/wif/wallet";
import { Button } from "@/components/ui/button";

export function WalletPanel() {
  if (
    import.meta.env["VITE_WIFAURA_PAYMENTS_ENABLED"] === "false" &&
    import.meta.env["VITE_WIFAURA_WALLETS_ENABLED"] !== "true"
  )
    return (
      <section className="mt-6 space-y-3 rounded-sm border p-4">
        <h2 className="eyebrow">WIF wallets</h2>
        <p className="text-sm text-muted-foreground">
          WIF payments and Reserve linking are not open yet. Enjoy your complimentary unsealings
          while checkout is being prepared.
        </p>
      </section>
    );
  return <ActiveWalletPanel />;
}

function ActiveWalletPanel() {
  const account = useServerFn(wifAccount),
    challenge = useServerFn(walletChallenge),
    link = useServerFn(linkWallet);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["wif-account"], queryFn: () => account() });
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  async function connect(purpose: "payer" | "reserve") {
    setBusy(true);
    try {
      const address = await connectWifWallet();
      if (
        q.data?.links.some(
          (l) => l.purpose !== purpose && l.address.toLowerCase() === address.toLowerCase(),
        )
      )
        throw new Error(
          "Paying and Reserve wallets must be different. Tap Change wallet or account, reconnect, and select only the account you want to verify.",
        );
      const c = await challenge({ data: { address, purpose } });
      const signature = await signWifMessage(c.message, address);
      await link({ data: { id: c.id, signature } });
      await qc.invalidateQueries({ queryKey: ["wif-account"] });
      setStatus(`${purpose === "payer" ? "Paying" : "Reserve"} wallet verified.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Wallet request failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-6 space-y-3 rounded-sm border p-4 [&_button]:w-full [&_button]:whitespace-normal">
      <h2 className="eyebrow">Robinhood Chain wallets</h2>
      {import.meta.env["VITE_WIFAURA_PAYMENTS_ENABLED"] === "false" && (
        <p className="text-sm text-muted-foreground">
          Wallet setup is available. Paid checkout is not enabled yet.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Verify one paying account and a different Reserve account. Select only one account for each
        connection. Use Change wallet or account before connecting the other account. Ownership
        signatures do not approve spending.
      </p>
      <a className="block text-xs text-gold underline" href="/wallet-setup">
        Set up phone network
      </a>
      {q.data?.links.map((l) => (
        <p key={l.purpose} className="break-all text-xs text-ivory">
          {l.purpose}: {l.address}
        </p>
      ))}
      {q.error && <p role="alert">{q.error.message}</p>}
      <Button variant="outline" disabled={busy} onClick={() => connect("payer")}>
        Verify paying wallet
      </Button>
      <Button variant="outline" disabled={busy} onClick={() => connect("reserve")}>
        Verify Reserve wallet
      </Button>
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await changeWifWallet();
            setStatus(
              "Connection closed. Tap Verify paying wallet or Verify Reserve wallet, then select only the account for that role.",
            );
          } catch {
            setStatus(
              "Could not close the connection. Try again before selecting another account.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Change wallet or account
      </Button>
      <p role="status" className="text-xs text-muted-foreground">
        {status}
      </p>
      <p className="text-xs text-muted-foreground">
        WIFAURA never asks for a private key or recovery phrase. Gas is paid in ETH.
      </p>
    </section>
  );
}
