"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-header";
import { LogoLoader } from "@/components/logo-loader";
import { identityOf, useProfile } from "@/lib/account-client";
import { isLeaving, useSession } from "@/lib/session";
import { useFollowWorkspaceSwitches, useWorkspaces } from "@/lib/workspace/client";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, loading, loggedIn, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const profile = useProfile(session);
  const identity = identityOf(session, profile.data);
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

  // First sign-in no longer opens a dialog: the Overview shows an inline setup
  // checklist, and name and photo stay optional in Account settings.
  return (
    <AppShell
      pathname={pathname}
      identity={identity}
      workspaces={{ list: workspaces.list, current: workspaces.current }}
      onSignOut={() => signOut({ to: "/login/?signed_out=1" })}
    >
      {children}
    </AppShell>
  );
}
