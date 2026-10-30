"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Building2,
  CreditCard,
  FileText,
  GitPullRequest,
  Globe,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  Plus,
  ScanSearch,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Logo } from "@/components/logo";
import { AccountMenu } from "@/components/account/account-menu";
import { featureAgentEnabled, featureMeasureEnabled } from "@/lib/agent-client";
import type { Identity } from "@/lib/account-client";
import { WorkspaceSwitcher } from "@/components/workspace/workspace-switcher";
import { atLeast } from "@/lib/workspace/roles";
import { cn } from "@/lib/utils";
import type { WorkspaceKind, WorkspaceSummary } from "@/lib/workspace/types";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  on: boolean;
  agency?: boolean;
}

/** Daily destinations, in the order agency work flows: clients → sites → fixes → reports → proof. */
const NAV: NavItem[] = [
  { href: "/app/", label: "Overview", icon: LayoutDashboard, on: true },
  { href: "/app/clients/", label: "Clients", icon: Building2, on: true, agency: true },
  { href: "/app/sites/", label: "Sites", icon: Globe, on: true },
  { href: "/app/agent/", label: "Fix runs", icon: GitPullRequest, on: featureAgentEnabled() },
  { href: "/app/analyses/", label: "Reports", icon: FileText, on: true },
  { href: "/app/impact/", label: "Impact", icon: LineChart, on: featureMeasureEnabled() },
  { href: "/app/alerts/", label: "Alerts", icon: Bell, on: true },
].filter((n) => n.on);

/** Workspace settings: who's in it and what it pays for. */
const SETTINGS: NavItem[] = [
  { href: "/app/team/", label: "Team", icon: UsersRound, on: true },
  { href: "/app/billing/", label: "Plan and billing", icon: CreditCard, on: true },
];

/** The links for this workspace: Clients only in agency workspaces (or while you're on it). */
function navFor(kind: WorkspaceKind | undefined, pathname: string) {
  return NAV.filter((n) => !n.agency || kind === "agency" || isActive(pathname, n.href));
}

// Sub-pages that belong to a nav item without sharing its path prefix.
const ALSO: Record<string, string[]> = {
  "/app/analyses/": ["/app/report", "/app/new"],
  "/app/billing/": ["/app/checkout"],
  "/app/agent/": ["/app/connect"],
};

export function isActive(pathname: string, href: string): boolean {
  const p = pathname.replace(/\/$/, "") || "/";
  if (href === "/app/") return p === "/app";
  return [href.replace(/\/$/, ""), ...(ALSO[href] ?? [])].some((a) => p === a || p.startsWith(`${a}/`) || p.startsWith(`${a}?`));
}

interface ShellProps {
  pathname: string;
  identity: Identity | null;
  onSignOut: () => void;
  /** Your workspaces and the one you're in (the switcher shows once there are two). */
  workspaces?: { list: WorkspaceSummary[] | null; current: WorkspaceSummary | null };
}

/**
 * Signed-in navigation (refinement 2026-10-30). From lg up a persistent
 * sidebar holds the workspace, the two ways to start work (a free scan or a
 * paid analysis), the daily destinations and, apart from them, the workspace
 * settings. Below lg a slim top bar opens the same list in a drawer, so no
 * destination hides in a horizontally scrolling strip.
 */
export function AppSidebar(props: ShellProps) {
  return (
    <aside
      aria-label="App"
      className="o-glass sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-e border-edge bg-background/95 print:hidden lg:flex"
    >
      <div className="flex h-14 items-center px-4">
        <Logo />
      </div>
      <NavBody {...props} />
    </aside>
  );
}

export function AppTopBar(props: ShellProps) {
  const [open, setOpen] = useState(false);
  // Close the drawer when a link inside it changes the page.
  useEffect(() => setOpen(false), [props.pathname]);
  return (
    <header className="o-glass sticky top-0 z-40 border-b border-edge bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75 print:hidden lg:hidden">
      <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open} aria-controls="app-drawer">
            <Menu className="size-5" aria-hidden />
          </Button>
          <Logo />
        </div>
        {props.identity ? (
          <AccountMenu identity={props.identity} onSignOut={props.onSignOut} />
        ) : (
          <Button variant="ghost" size="sm" onClick={props.onSignOut}>
            <LogOut className="size-4" aria-hidden /> Sign out
          </Button>
        )}
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent id="app-drawer" side="left" className="w-[280px] gap-0 p-0 sm:max-w-[280px]">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Pages in this workspace and its settings.</SheetDescription>
          <div className="flex h-14 items-center border-b border-edge px-4">
            <Logo />
          </div>
          <NavBody {...props} hideAccount />
        </SheetContent>
      </Sheet>
    </header>
  );
}

function NavBody({ pathname, identity, onSignOut, workspaces, hideAccount }: ShellProps & { hideAccount?: boolean }) {
  // Viewers can't start anything; everyone else can (the server checks too).
  const canStart = !workspaces?.current || atLeast(workspaces.current.role, "member");
  const nav = navFor(workspaces?.current?.kind, pathname);
  const current = workspaces?.current ?? null;
  const many = (workspaces?.list?.length ?? 0) > 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-3 px-3 pb-3 pt-2">
        {current &&
          (many && workspaces?.list ? (
            <WorkspaceSwitcher list={workspaces.list} current={current} />
          ) : (
            <p className="truncate px-2 text-[13px] text-muted-foreground" title={current.name}>
              {current.name}
            </p>
          ))}
        {canStart && (
          <div className="grid gap-1.5">
            <Button asChild size="sm" className="w-full justify-start">
              <Link href="/app/new/">
                <Plus className="size-4" aria-hidden /> New analysis
              </Link>
            </Button>
            <Button asChild size="sm" variant="hairline" className="w-full justify-start">
              <Link href="/app/scan/" aria-current={isActive(pathname, "/app/scan/") ? "page" : undefined}>
                <ScanSearch className="size-4" aria-hidden /> Free scan
              </Link>
            </Button>
          </div>
        )}
      </div>

      <nav aria-label="Workspace" className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <ul className="grid gap-0.5">
          {nav.map((n) => (
            <li key={n.href}>
              <NavLink item={n} active={isActive(pathname, n.href)} />
            </li>
          ))}
        </ul>
        <p className="mt-6 px-2.5 pb-1.5 text-[12px] text-faint">Workspace settings</p>
        <ul className="grid gap-0.5">
          {SETTINGS.map((n) => (
            <li key={n.href}>
              <NavLink item={n} active={isActive(pathname, n.href)} />
            </li>
          ))}
        </ul>
      </nav>

      {!hideAccount && (
        <div className="flex items-center justify-between gap-2 border-t border-edge px-3 py-3">
          {identity ? (
            <>
              <span className="min-w-0 truncate px-1 text-[13px] text-muted-foreground" dir="ltr">
                {identity.name ?? identity.email}
              </span>
              <AccountMenu identity={identity} onSignOut={onSignOut} />
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={onSignOut}>
              <LogOut className="size-4" aria-hidden /> Sign out
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[14px] transition-colors duration-[var(--dur-hover)] pointer-coarse:h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-chip hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {item.label}
    </Link>
  );
}

/** The signed-in frame: sidebar (lg+) or top bar and drawer, then the page. */
export function AppShell({ children, ...props }: ShellProps & { children: React.ReactNode }) {
  return (
    <div dir="ltr" data-surface="app" className="flex min-h-screen">
      <AppSidebar {...props} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopBar {...props} />
        <main id="main-content" className="flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 md:py-10 print:max-w-none print:p-0">{children}</div>
        </main>
      </div>
    </div>
  );
}
