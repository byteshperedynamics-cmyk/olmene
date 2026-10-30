"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-header";
import { Eyebrow } from "@/components/v2/atoms";
import { TeamView } from "@/components/workspace/team-view";
import type { Identity } from "@/lib/account-client";
import type { WorkspaceRole } from "@/lib/workspace/roles";
import type { WorkspaceSummary, WorkspaceView } from "@/lib/workspace/types";

const ME = "00000000-0000-0000-0000-0000000000b2";
const ANA = "00000000-0000-0000-0000-0000000000a1";

const IDENTITY: Identity = {
  name: "Ben Ortiz",
  firstName: "Ben",
  email: "ben@acme-analytics.com",
  initials: "BO",
  avatarUrl: null,
  providerAvatarUrl: null,
  providers: ["google"],
  createdAt: null,
  lastSignInAt: null,
};

const LIST: WorkspaceSummary[] = [
  { ownerId: ME, name: "Ben's workspace", kind: "company", role: "owner", own: true, ownerName: "Ben Ortiz", ownerAvatarUrl: null },
  { ownerId: ANA, name: "Acme Analytics", kind: "company", role: "admin", own: false, ownerName: "Ana Lima", ownerAvatarUrl: null },
  { ownerId: "00000000-0000-0000-0000-0000000000c3", name: "Northwind Studio", kind: "agency", role: "viewer", own: false, ownerName: "Cleo Park", ownerAvatarUrl: null },
];

function view(role: WorkspaceRole, full: boolean): WorkspaceView {
  const inDays = (d: number) => new Date(Date.now() + d * 864e5).toISOString();
  return {
    ownerId: ANA,
    name: "Acme Analytics",
    kind: "company",
    role,
    members: [
      { userId: ANA, name: "Ana Lima", email: "ana@acme-analytics.com", avatarUrl: null, role: "owner", joinedAt: inDays(-90), you: role === "owner" },
      { userId: ME, name: "Ben Ortiz", email: "ben@acme-analytics.com", avatarUrl: null, role: role === "owner" ? "admin" : role, joinedAt: inDays(-30), you: role !== "owner" },
      { userId: "u3", name: null, email: "dev@acme-analytics.com", avatarUrl: null, role: "member", joinedAt: inDays(-10), you: false },
      ...(full ? [{ userId: "u4", name: "Dana Ruiz", email: "dana@acme-analytics.com", avatarUrl: null, role: "viewer" as const, joinedAt: inDays(-2), you: false }] : []),
    ],
    invites:
      role === "admin" || role === "owner"
        ? [
            { id: "i1", email: "marketing@acme-analytics.com", role: "viewer", invitedBy: "Ana Lima", createdAt: inDays(-3), expiresAt: inDays(11), expired: false },
            { id: "i2", email: "old.contractor@example.com", role: "member", invitedBy: "Ben Ortiz", createdAt: inDays(-20), expiresAt: inDays(-6), expired: true },
          ]
        : [],
    seats: { used: full ? 5 : 4, limit: 5, plan: "team" },
  };
}

/** ?role=owner|admin|member|viewer (default admin); ?full=1: every place taken. Writes go nowhere. */
export function TeamPreview() {
  const [state, setState] = useState<{ role: WorkspaceRole; full: boolean } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get("role");
    setState({ role: r === "owner" || r === "member" || r === "viewer" ? r : "admin", full: q.get("full") === "1" });
  }, []);
  if (!state) return null;
  const v = view(state.role, state.full);
  const current = { ...LIST[1], role: state.role };
  return (
    <AppShell pathname="/app/team/" identity={IDENTITY} workspaces={{ list: [LIST[0], current, LIST[2]], current }} onSignOut={() => toast("Signed out (preview)")}>
          <div className="mx-auto grid max-w-3xl gap-6">
            <header className="grid gap-2">
              <Eyebrow>Team</Eyebrow>
              <h1 className="o-display text-[32px] leading-tight">{v.name}</h1>
              <p className="max-w-xl text-[15px] text-muted-foreground">Everyone here works on the same plan, sites, reports and fixes.</p>
            </header>
            <TeamView view={v} onChanged={() => toast("Changed (preview)")} onLeft={() => toast("Left (preview)")} />
          </div>
    </AppShell>
  );
}
