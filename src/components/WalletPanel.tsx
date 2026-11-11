import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { wifAccount, walletChallenge, linkWallet } from "@/lib/wif/payments.functions";
import { connectWifWallet, signWifMessage } from "@/lib/wif/wallet";
import { Button } from "@/components/ui/button";

export function WalletPanel() {
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
    <section className="mt-6 space-y-3 rounded-sm border p-4">
      <h2 className="eyebrow">Robinhood Chain wallets</h2>
      <p className="text-xs text-muted-foreground">
        Select an account in your wallet, then sign an ownership message. Switch accounts to choose
        a separate Reserve.
      </p>
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
      <p role="status" className="text-xs text-muted-foreground">
        {status}
      </p>
      <p className="text-xs text-muted-foreground">
        WIFAURA never asks for a private key or recovery phrase. Gas is paid in ETH.
      </p>
    </section>
  );
}
