"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { AccountView } from "@/components/account/account-view";
import { WelcomeDialog } from "@/components/account/welcome-dialog";
import type { AccountOverview } from "@/lib/account-client";
import { IDENTITY, OVERVIEW, PROFILE } from "./fixtures";

/**
 * ?state=new: a brand-new account (no name, no sites); ?welcome=1: the
 * first-sign-in dialog on top. Writes go nowhere: buttons that would call
 * the API just fail with their normal error toast.
 */
export function AccountPreview() {
  const [state, setState] = useState<{ fresh: boolean; welcome: boolean } | null>(null);
  const [overview, setOverview] = useState<AccountOverview>(OVERVIEW);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const fresh = q.get("state") === "new";
    setState({ fresh, welcome: q.get("welcome") === "1" });
    if (fresh) setOverview({ sites: [], totals: { reports: 0, fixesShipped: 0, sites: 0 }, shares: [], plan: { renews: false, renewsAt: null } });
  }, []);
  if (!state) return null;
  const identity = state.fresh ? { ...IDENTITY, name: null, firstName: "Ada", initials: "A", providers: ["email"] } : IDENTITY;
  const profile = state.fresh ? { ...PROFILE, display_name: null, onboarded_at: null } : PROFILE;
  return (
    <div dir="ltr" className="flex min-h-screen flex-col">
      <AppHeader pathname="/app/account/" identity={identity} onSignOut={() => toast("Signed out (preview)")} />
      <main id="main-content" className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 md:py-10">
          <AccountView
            identity={identity}
            profile={profile}
            overview={overview}
            onProfileChanged={() => {}}
            onOverviewChanged={(next) => next && setOverview(next)}
            signOut={() => toast("Signed out (preview)")}
          />
        </div>
      </main>
      {state.welcome && <WelcomeDialog identity={identity} hasOwnPhoto={false} hasWork={false} onDone={() => {}} onProfileChanged={() => {}} />}
    </div>
  );
}
