"use client";

import Link from "next/link";
import { LogOut, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { featureAgentEnabled, featureMeasureEnabled } from "@/lib/agent-client";

const NAV = [
  { href: "/app/", label: "Analyses", on: true },
  { href: "/app/billing/", label: "Billing", on: true },
  { href: "/app/agent/", label: "Fix runs", on: featureAgentEnabled() },
  { href: "/app/impact/", label: "Impact", on: featureMeasureEnabled() },
  { href: "/app/alerts/", label: "Alerts", on: true },
].filter((n) => n.on);

// Sub-pages that belong to a nav item without sharing its path prefix.
const ALSO: Record<string, string[]> = {
  "/app/": ["/app/report", "/app/new"],
  "/app/billing/": ["/app/checkout"],
  "/app/agent/": ["/app/connect"],
};

function isActive(pathname: string, href: string): boolean {
  const p = pathname.replace(/\/$/, "") || "/";
  if (href === "/app/") return p === "/app" || (ALSO[href] ?? []).some((a) => p.startsWith(a));
  return [href.replace(/\/$/, ""), ...(ALSO[href] ?? [])].some((a) => p.startsWith(a));
}

/**
 * Signed-in app header. From sm up the links sit inline next to the logo;
 * below sm they move to a scrollable tab row under the bar, and the action
 * buttons collapse to icons so nothing clips at 375px.
 */
export function AppHeader({ pathname, onSignOut }: { pathname: string; onSignOut: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 print:hidden">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Logo />
          <nav className="hidden items-center gap-4 sm:flex" aria-label="App">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={isActive(pathname, n.href) ? "page" : undefined}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-foreground"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Button asChild size="sm" variant="outline" aria-label="New analysis">
            <Link href="/app/new/">
              <Plus className="size-4" aria-hidden />
              <span className="hidden sm:inline">New analysis</span>
            </Link>
          </Button>
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={onSignOut} aria-label="Sign out">
            <LogOut className="size-4 sm:hidden" aria-hidden />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
      {/* Mobile: the same links as a scrollable tab row (sm+ uses the inline nav above). */}
      <nav
        aria-label="App"
        className="flex gap-1 overflow-x-auto border-t border-border/50 px-3 py-1.5 [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden"
      >
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={isActive(pathname, n.href) ? "page" : undefined}
            className="shrink-0 rounded-md px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:bg-secondary aria-[current=page]:text-foreground"
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
