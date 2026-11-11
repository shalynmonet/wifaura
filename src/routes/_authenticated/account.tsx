import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { WalletPanel } from "@/components/WalletPanel";
import { Button } from "@/components/ui/button";
import { profileQuery } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
export const Route = createFileRoute("/_authenticated/account")({
  component: Account,
  head: () => ({ meta: [{ title: "Account — WIFAURA" }] }),
});
function Account() {
  const profile = useQuery(profileQuery()),
    qc = useQueryClient(),
    navigate = useNavigate();
  return (
    <AppShell>
      <h1 className="mt-6 font-display text-4xl">{profile.data?.display_name ?? "Collector"}</h1>
      <p className="mt-4">Complimentary credits: {profile.data?.credits ?? "–"}</p>
      <WalletPanel />
      <Link to="/reserve" className="mt-6 block text-gold">
        View WIF payments and Reserve →
      </Link>
      <Button
        className="mt-8"
        variant="outline"
        onClick={async () => {
          await qc.cancelQueries();
          qc.clear();
          await supabase.auth.signOut();
          navigate({ to: "/auth", replace: true });
        }}
      >
        Sign out
      </Button>
    </AppShell>
  );
}
