import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { EIP1193Provider } from "viem";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { setupRobinhoodNetwork } from "@/lib/wif/network-setup";
export const Route = createFileRoute("/wallet-setup")({ component: WalletSetup });
function WalletSetup() {
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  return (
    <AppShell>
      <section className="mt-8 space-y-5">
        <h1 className="font-display text-3xl">Set up your phone wallet</h1>
        <p>
          Add or select Robinhood Chain in MetaMask. This changes network settings only; it requests
          no signature, token approval or payment.
        </p>
        <p className="text-sm">1. Open this setup page inside MetaMask.</p>
        <a
          className="block rounded border border-gold p-4 text-center text-gold"
          href="https://link.metamask.io/dapp/wifaura.sha-i.com/wallet-setup"
        >
          Open setup in MetaMask
        </a>
        <p className="text-sm">2. Inside MetaMask, tap below and review its network prompts.</p>
        <Button
          className="w-full whitespace-normal"
          disabled={busy}
          onClick={async () => {
            const provider = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
            if (!provider) {
              setStatus(
                "Use Open setup in MetaMask first, then tap this button inside its browser.",
              );
              return;
            }
            setBusy(true);
            try {
              await setupRobinhoodNetwork(provider);
              setStatus(
                "Robinhood Chain is ready. Return to your original Safari tab, tap Change wallet app, then reconnect MetaMask and select the paying wallet shown in WIFAURA.",
              );
            } catch {
              setStatus(
                "Network setup was not completed. Review MetaMask's network prompt. No transaction was requested.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Review network setup in MetaMask…" : "Add or select Robinhood Chain"}
        </Button>
        <div className="break-words text-xs text-muted-foreground">
          Robinhood Chain · Chain ID 4663 · ETH
          <br />
          RPC: https://rpc.mainnet.chain.robinhood.com
          <br />
          Explorer: https://robinhoodchain.blockscout.com
        </div>
        <p role="status" className="text-sm text-gold">
          {status}
        </p>
      </section>
    </AppShell>
  );
}
