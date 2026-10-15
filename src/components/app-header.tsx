"use client";

import Link from "next/link";
import { LogOut, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { AccountMenu } from "@/components/account/account-menu";
import { featureAgentEnabled, featureMeasureEnabled } from "@/lib/agent-client";
import type { Identity } from "@/lib/account-client";
import { WorkspaceSwitcher } from "@/components/workspace/workspace-switcher";
import { atLeast } from "@/lib/workspace/roles";
import { cn } from "@/lib/utils";
import type { WorkspaceKind, WorkspaceSummary } from "@/lib/workspace/types";

const NAV = [
  { href: "/app/", label: "Analyses", on: true },
  { href: "/app/sites/", label: "Sites", on: true },
  { href: "/app/clients/", label: "Clients", on: true, agency: true },
  { href: "/app/billing/", label: "Billing", on: true },
  { href: "/app/agent/", label: "Fix runs", on: featureAgentEnabled() },
  { href: "/app/impact/", label: "Impact", on: featureMeasureEnabled() },
  { href: "/app/alerts/", label: "Alerts", on: true },
  { href: "/app/team/", label: "Team", on: true },
].filter((n) => n.on);

/** The links for this workspace: Clients only in agency workspaces (or while you're on it). */
function navFor(kind: WorkspaceKind | undefined, pathname: string) {
  return NAV.filter((n) => !n.agency || kind === "agency" || isActive(pathname, n.href));
}

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
 * Signed-in app header. From lg up the links sit inline next to the logo
 * (from xl when an agency's extra link and the switcher make them too many);
 * below that they move to a scrollable tab row under the bar, and below sm the
 * action buttons collapse to icons so nothing clips at 375px. The person's picture
 * on the right opens the account menu (account, sharing, billing, sign out).
 */
export function AppHeader({
  pathname,
  identity,
  onSignOut,
  workspaces,
}: {
  pathname: string;
  identity: Identity | null;
  onSignOut: () => void;
  /** Your workspaces and the one you're in (the switcher shows once there are two). */
  workspaces?: { list: WorkspaceSummary[] | null; current: WorkspaceSummary | null };
}) {
  // Viewers can't start anything; everyone else can (the server checks too).
  const canStart = !workspaces?.current || atLeast(workspaces.current.role, "member");
  const nav = navFor(workspaces?.current?.kind, pathname);
  // Inline links from lg while they fit beside the switcher; with more (an agency's
  // Clients plus the switcher) they stay in the tab row until xl.
  const switcher = !!workspaces?.current && (workspaces.list?.length ?? 0) > 1;
  const roomy = nav.length + (switcher ? 2 : 0) <= 8;
  return (
    <header className="o-glass sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 print:hidden">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-6">
          <Logo />
          {workspaces?.list && <WorkspaceSwitcher list={workspaces.list} current={workspaces.current} />}
          <nav className={cn("hidden items-center gap-4", roomy ? "lg:flex" : "xl:flex")} aria-label="App">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={isActive(pathname, n.href) ? "page" : undefined}
                className="whitespace-nowrap text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:text-foreground"
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {canStart && (
            <Button asChild size="sm" variant="outline" aria-label="New analysis">
              <Link href="/app/new/">
                <Plus className="size-4" aria-hidden />
                <span className="hidden sm:inline">New analysis</span>
              </Link>
            </Button>
          )}
          {identity ? (
            <AccountMenu identity={identity} onSignOut={onSignOut} />
          ) : (
            <Button variant="ghost" size="sm" onClick={onSignOut} aria-label="Sign out">
              <LogOut className="size-4 sm:hidden" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          )}
        </div>
      </div>
      {/* Below lg (or xl): the same links as a scrollable tab row. */}
      <nav
        aria-label="App"
        className={cn(
          "flex gap-1 overflow-x-auto border-t border-border/50 px-3 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          roomy ? "lg:hidden" : "xl:hidden",
        )}
      >
        {nav.map((n) => (
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
