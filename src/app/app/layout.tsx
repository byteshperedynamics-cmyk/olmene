"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { LogoLoader } from "@/components/logo-loader";
import { useSession } from "@/lib/session";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, loading, loggedIn, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname() ?? "";

  useEffect(() => {
    if (!loading && !loggedIn) {
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
      router.replace("/login/");
    }
  }, [loading, loggedIn, router]);

  if (loading || !loggedIn) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <LogoLoader size={44} glow />
          <p className="text-sm">Checking sign-in…</p>
        </div>
      </div>
    );
  }

  return (
    <div dir="ltr" className="flex min-h-screen flex-col">
      <AppHeader pathname={pathname} onSignOut={() => signOut()} />
      <main id="main-content" className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 md:py-10 print:max-w-none print:p-0">{children}</div>
      </main>
      <span className="hidden">{session?.user?.email}</span>
    </div>
  );
}
