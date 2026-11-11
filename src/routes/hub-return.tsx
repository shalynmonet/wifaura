import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
export const Route = createFileRoute("/hub-return")({
  component: () => (
    <AppShell>
      <p className="mt-10">Nimiq wallet returns are unavailable in WIFAURA.</p>
      <Link to="/account">Open WIF wallets</Link>
    </AppShell>
  ),
});
