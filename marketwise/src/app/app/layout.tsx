"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { LogoLoader } from "@/components/logo-loader";
import { useSession } from "@/lib/session";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, loading, loggedIn, signOut } = useSession();
  const router = useRouter();

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
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 print:hidden">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Logo />
            <nav className="hidden items-center gap-4 sm:flex" aria-label="App">
              <Link href="/app/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                Analyses
              </Link>
              <Link href="/app/billing/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                Billing
              </Link>
              {process.env.NEXT_PUBLIC_FEATURE_AGENT === "true" && (
                <Link href="/app/agent/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                  Agent
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/app/new/">
                <Plus className="size-4" aria-hidden /> New analysis
              </Link>
            </Button>
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main id="main-content" className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 md:py-10 print:max-w-none print:p-0">{children}</div>
      </main>
      <span className="hidden">{session?.user?.email}</span>
    </div>
  );
}
