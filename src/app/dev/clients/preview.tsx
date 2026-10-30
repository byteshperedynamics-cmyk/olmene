"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-header";
import ClientsPage from "@/app/app/clients/page";
import type { Identity } from "@/lib/account-client";
import type { WorkspaceRole } from "@/lib/workspace/roles";
import type { WorkspaceSummary } from "@/lib/workspace/types";
import { installFakeClientsApi } from "./fake-api";
import { clientsFixture } from "./fixtures";

const IDENTITY: Identity = {
  name: "Cleo Park",
  firstName: "Cleo",
  email: "cleo@northwind.example",
  initials: "CP",
  avatarUrl: null,
  providerAvatarUrl: null,
  providers: ["google"],
  createdAt: null,
  lastSignInAt: null,
};

/**
 * The real Clients page, its API answered from memory (fake-api.ts), so
 * every button works. ?role=owner|admin|member|viewer (default admin);
 * ?state=company|new|empty; ?brand=none|wl; ?plan=fix (no white label).
 */
export function ClientsPreview() {
  const [ready, setReady] = useState<{ ws: WorkspaceSummary; list: WorkspaceSummary[] } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get("role");
    const role: WorkspaceRole = r === "owner" || r === "member" || r === "viewer" ? r : "admin";
    const view = clientsFixture({ role, state: q.get("state"), brand: q.get("brand"), plan: q.get("plan") });
    const uninstall = installFakeClientsApi(view);
    const ws: WorkspaceSummary = { ownerId: "00000000-0000-0000-0000-0000000000c3", name: "Northwind Studio", kind: view.kind, role, own: role === "owner", ownerName: "Cleo Park", ownerAvatarUrl: null };
    // A second workspace, so the switcher shows as it would for most agency staff.
    const other: WorkspaceSummary =
      role === "owner"
        ? { ownerId: "00000000-0000-0000-0000-0000000000a1", name: "Acme Analytics", kind: "company", role: "member", own: false, ownerName: "Ana Lima", ownerAvatarUrl: null }
        : { ownerId: "00000000-0000-0000-0000-0000000000b2", name: "Ben's workspace", kind: "company", role: "owner", own: true, ownerName: "Ben Ortiz", ownerAvatarUrl: null };
    setReady({ ws, list: role === "owner" ? [ws, other] : [other, ws] });
    return uninstall;
  }, []);
  if (!ready) return null;
  return (
    <AppShell pathname="/app/clients/" identity={IDENTITY} workspaces={{ list: ready.list, current: ready.ws }} onSignOut={() => toast("Signed out (preview)")}>
          <ClientsPage />
    </AppShell>
  );
}
