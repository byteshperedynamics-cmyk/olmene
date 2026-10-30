"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountView } from "@/components/account/account-view";
import { getOverview, identityOf, useProfile, type AccountOverview } from "@/lib/account-client";
import { useSession } from "@/lib/session";

export default function AccountPage() {
  const { session, signOut } = useSession();
  const qc = useQueryClient();
  const profile = useProfile(session);
  const overview = useQuery({ queryKey: ["account-overview"], queryFn: getOverview, enabled: !!session, retry: 1 });
  const identity = identityOf(session, profile.data);

  if (!identity) {
    return (
      <div className="mx-auto grid max-w-5xl gap-6">
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <AccountView
      identity={identity}
      profile={profile.data}
      overview={overview.data}
      overviewError={overview.isError}
      onProfileChanged={() => void qc.invalidateQueries({ queryKey: ["profile"] })}
      onOverviewChanged={(next?: AccountOverview) =>
        next ? qc.setQueryData(["account-overview"], next) : void qc.invalidateQueries({ queryKey: ["account-overview"] })
      }
      signOut={signOut}
    />
  );
}
