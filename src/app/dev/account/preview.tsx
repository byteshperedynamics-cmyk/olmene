"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-header";
import { AccountView } from "@/components/account/account-view";
import type { AccountOverview } from "@/lib/account-client";
import { IDENTITY, OVERVIEW, PROFILE } from "./fixtures";

/**
 * ?state=new: a brand-new account (no name, no sites). Writes go nowhere: buttons that would call
 * the API just fail with their normal error toast.
 */
export function AccountPreview() {
  const [state, setState] = useState<{ fresh: boolean } | null>(null);
  const [overview, setOverview] = useState<AccountOverview>(OVERVIEW);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const fresh = q.get("state") === "new";
    setState({ fresh });
    if (fresh) setOverview({ sites: [], totals: { reports: 0, fixesShipped: 0, sites: 0 }, shares: [], plan: { renews: false, renewsAt: null } });
  }, []);
  if (!state) return null;
  const identity = state.fresh ? { ...IDENTITY, name: null, firstName: "Ada", initials: "A", providers: ["email"] } : IDENTITY;
  const profile = state.fresh ? { ...PROFILE, display_name: null, onboarded_at: null } : PROFILE;
  return (
    <AppShell pathname="/app/account/" identity={identity} onSignOut={() => toast("Signed out (preview)")}>
          <AccountView
            identity={identity}
            profile={profile}
            overview={overview}
            onProfileChanged={() => {}}
            onOverviewChanged={(next) => next && setOverview(next)}
            signOut={() => toast("Signed out (preview)")}
          />
    </AppShell>
  );
}
