/**
 * Workspace roles, shared by the browser and the Worker (no I/O here).
 *
 * A workspace is an account that pays: the owner's plan, sites, reports,
 * fixes and connections. Data stays keyed by the owner's user id; everyone
 * else works on it through their role (migration 20261022_workspaces.sql).
 */

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";
export type InvitableRole = Exclude<WorkspaceRole, "owner">;

export const ROLE_RANK: Record<WorkspaceRole, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };
export const INVITABLE_ROLES: InvitableRole[] = ["admin", "member", "viewer"];

/** Which workspace a request acts in: the owner's user id. Absent = your own account. */
export const WORKSPACE_HEADER = "x-olmene-workspace";

export const ROLE_COPY: Record<WorkspaceRole, { label: string; blurb: string; you: string }> = {
  owner: { label: "Owner", blurb: "Plan and billing, and everything else.", you: "You'll look after the plan and billing, and everything else." },
  admin: { label: "Admin", blurb: "Manages the team and connections, and does every kind of work.", you: "You'll manage the team and connections, and do every kind of work." },
  member: { label: "Member", blurb: "Runs scans, reports and fixes.", you: "You'll run scans, reports and fixes." },
  viewer: { label: "Viewer", blurb: "Sees everything, changes nothing.", you: "You'll see every report, site and fix." },
};

export function isRole(v: unknown): v is WorkspaceRole {
  return v === "owner" || v === "admin" || v === "member" || v === "viewer";
}

export function isInvitableRole(v: unknown): v is InvitableRole {
  return v === "admin" || v === "member" || v === "viewer";
}

/** True when `role` is at least `need` (owner > admin > member > viewer). */
export function atLeast(role: WorkspaceRole | null | undefined, need: WorkspaceRole): boolean {
  return !!role && ROLE_RANK[role] >= ROLE_RANK[need];
}

/** Why an action is refused, in words a person can act on. */
export function roleRequiredMessage(need: WorkspaceRole): string {
  switch (need) {
    case "owner":
      return "Only the workspace owner can do this.";
    case "admin":
      return "Only admins can do this. Ask an admin or the owner.";
    case "member":
      return "Viewers can look but not change anything. Ask an admin for the Member role.";
    default:
      return "You don't have access to this workspace.";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

/**
 * People each plan includes, the owner counted. Keyed by plans.slug;
 * anything not listed (no plan, a one-off report) is just the owner.
 */
export const SEATS_BY_PLAN: Record<string, number> = {
  fix: 2,
  "fix-yearly": 2,
  team: 5,
  "team-yearly": 5,
};

export function seatLimit(planSlug: string | null | undefined): number {
  return (planSlug && SEATS_BY_PLAN[planSlug]) || 1;
}

/** A workspace name from what we know about the owner (shown until they rename it). */
export function defaultWorkspaceName(displayName: string | null | undefined, email: string | null | undefined): string {
  const name = displayName?.trim();
  if (name) return `${name.split(/\s+/)[0]}'s workspace`.slice(0, 80);
  const domain = email?.split("@")[1]?.toLowerCase() ?? "";
  const personal = /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|proton|protonmail|gmx|aol|mail)\./;
  if (domain && !personal.test(domain)) {
    const org = domain.split(".")[0];
    return org ? `${org.charAt(0).toUpperCase()}${org.slice(1)}`.slice(0, 80) : "My workspace";
  }
  return "My workspace";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  return e.length <= 254 && EMAIL.test(e) ? e : null;
}
