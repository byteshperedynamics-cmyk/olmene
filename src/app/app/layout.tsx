"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { LogoLoader } from "@/components/logo-loader";
import { WelcomeDialog } from "@/components/account/welcome-dialog";
import { identityOf, useProfile } from "@/lib/account-client";
import { listJobs } from "@/lib/data";
import { isLeaving, useSession } from "@/lib/session";
import { useFollowWorkspaceSwitches, useWorkspaces } from "@/lib/workspace/client";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, loading, loggedIn, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const qc = useQueryClient();
  const profile = useProfile(session);
  const identity = identityOf(session, profile.data);
  // First sign-in: the profile row exists (the signup trigger made it) but onboarding hasn't run.
  const needsWelcome = !!profile.data && !profile.data.onboarded_at;
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: listJobs, enabled: needsWelcome });
  const workspaces = useWorkspaces(session);
  useFollowWorkspaceSwitches();

  useEffect(() => {
    if (!loading && !loggedIn && !isLeaving()) {
      // Surface magic-link failures (expired/used link, failed code exchange)
      // instead of bouncing to /login/ silently.
      if (typeof window !== "undefined") {
        const errMatch =
          window.location.hash.match(/error_code=([a-z_]+)/i) ??
          window.location.search.match(/error_code=([a-z_]+)/i);
        if (errMatch) {
          router.replace(`/login/?auth_error=${errMatch[1]}`);
          return;
        }
      }
      // Back here after signing in: return to the page they asked for.
      // (Never carry a used sign-in code along.)
      const search = typeof window !== "undefined" && !/[?&](code|error)=/.test(window.location.search) ? window.location.search : "";
      const here = typeof window !== "undefined" ? window.location.pathname + search : "/app/";
      router.replace(here && here !== "/app/" ? `/login/?next=${encodeURIComponent(here)}` : "/login/");
    }
  }, [loading, loggedIn, router]);

  if (loading || !loggedIn) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <LogoLoader size={44} glow />
          <p className="text-sm">{isLeaving() ? "Signing you out…" : "Checking sign-in…"}</p>
        </div>
      </div>
    );
  }

  return (
    <div dir="ltr" className="flex min-h-screen flex-col">
      <AppHeader
        pathname={pathname}
        identity={identity}
        workspaces={{ list: workspaces.list, current: workspaces.current }}
        onSignOut={() => signOut({ to: "/login/?signed_out=1" })}
      />
      <main id="main-content" className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 md:py-10 print:max-w-none print:p-0">{children}</div>
      </main>
      {needsWelcome && identity && jobs.isFetched && (
        <WelcomeDialog
          identity={identity}
          hasOwnPhoto={!!profile.data?.avatar_path}
          hasWork={(jobs.data?.length ?? 0) > 0}
          onProfileChanged={() => void qc.invalidateQueries({ queryKey: ["profile"] })}
          onDone={() => void qc.invalidateQueries({ queryKey: ["profile"] })}
        />
      )}
    </div>
  );
}
