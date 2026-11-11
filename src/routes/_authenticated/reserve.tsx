import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatUnits } from "viem";
import { AppShell } from "@/components/AppShell";
import { wifAccount } from "@/lib/wif/payments.functions";
import { robinhood } from "@/lib/wif/config";
export const Route = createFileRoute("/_authenticated/reserve")({
  component: Reserve,
  head: () => ({ meta: [{ title: "My Reserve — WIFAURA" }] }),
});
function Reserve() {
  const account = useServerFn(wifAccount);
  const available = import.meta.env["VITE_WIFAURA_PAYMENTS_ENABLED"] !== "false";
  const q = useQuery({ queryKey: ["wif-account"], queryFn: () => account(), enabled: available });
  return (
    <AppShell>
      <h1 className="mt-6 font-display text-4xl">My Reserve</h1>
      {!available && (
        <p className="mt-4 text-muted-foreground">
          WIF payments and Reserve delivery are not open yet.
        </p>
      )}
      <p className="mt-4 text-sm text-muted-foreground">
        Each verified WIF payment sends 50% directly to its snapshotted Reserve address. This is
        payment history, not your current wallet balance or an investment return. Showing the latest
        100 payments.
      </p>
      {q.isLoading && <p>Loading…</p>}
      {q.error && <p role="alert">{q.error.message}</p>}
      {q.data?.quotes.length === 0 && <p className="mt-6">No WIF payments yet.</p>}
      <ul className="mt-6 space-y-4">
        {q.data?.quotes.map((p) => (
          <li key={p.id} className="break-all border-b pb-4 text-sm">
            <p>
              {p.status === "fulfilled"
                ? `${formatUnits(BigInt(p.amount) / 2n, p.decimals)} WIF delivered to Reserve`
                : `${p.status} · Reserve delivery not verified`}
            </p>
            <p className="text-xs text-muted-foreground">{p.reserve}</p>
            {p.tx_hash && (
              <a
                className="text-gold"
                href={`${robinhood.blockExplorers.default.url}/tx/${p.tx_hash}`}
                target="_blank"
                rel="noreferrer"
              >
                View verified transaction ↗
              </a>
            )}
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
