/**
 * Workspaces on the Worker: who is acting for which account, and the team
 * (members, invitations, roles). Service-role client only (agent/db.ts), so
 * import this from API routes, never from client components.
 *
 * Every route that touches account data calls requireActor(): the person
 * signed in, the owner whose data they work on (from the
 * x-olmene-workspace header; their own account when absent) and their role
 * there. Data reads and writes use actor.ownerId; "who did it" uses
 * actor.user.id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";
import { getServiceDb, type AuthedUser } from "@/lib/agent/db";
import { appUrl } from "@/lib/agent/env";
import { jsonError, requireUser } from "@/lib/agent/http";
import { avatarUrl } from "@/lib/account/server";
import {
  WORKSPACE_HEADER,
  atLeast,
  defaultWorkspaceName,
  isRole,
  isUuid,
  roleRequiredMessage,
  seatLimit,
  type InvitableRole,
  type WorkspaceRole,
} from "./roles";
import type { InvitePreview, WorkspaceInvite, WorkspaceKind, WorkspaceMember, WorkspaceSummary, WorkspaceView } from "./types";

export interface Actor {
  user: AuthedUser;
  /** The account whose data this request reads and changes. */
  ownerId: string;
  role: WorkspaceRole;
}

/** The signed-in person's role on an owner's data, or null when they have none. */
export async function roleOn(db: SupabaseClient, ownerId: string, userId: string): Promise<WorkspaceRole | null> {
  if (ownerId === userId) return "owner";
  const { data, error } = await db.rpc("workspace_role", { p_owner: ownerId, p_user: userId });
  return !error && isRole(data) ? data : null;
}

/**
 * The person signed in and the workspace they act in, refusing anyone below
 * `need`. Without the header, it's their own account (always "owner"), so
 * nothing changes for people who never join a workspace.
 */
export async function requireActor(req: Request, need: WorkspaceRole = "viewer"): Promise<{ actor: Actor } | { error: NextResponse }> {
  const auth = await requireUser(req);
  if ("error" in auth) return auth;
  const requested = req.headers.get(WORKSPACE_HEADER)?.trim() ?? "";
  const ownerId = requested && requested !== auth.user.id ? requested : auth.user.id;
  if (ownerId !== auth.user.id && !isUuid(ownerId)) return { error: jsonError(400, "bad_workspace", "That workspace id isn't valid.") };
  const role = ownerId === auth.user.id ? "owner" : await roleOn(getServiceDb(), ownerId, auth.user.id);
  if (!role) return { error: jsonError(403, "not_a_member", "You're not a member of that workspace any more. Switch to another one.") };
  if (!atLeast(role, need)) return { error: jsonError(403, "role_required", roleRequiredMessage(need)) };
  return { actor: { user: auth.user, ownerId, role } };
}

// ── Plans and seats ────────────────────────────────────────────────────────

/** The plan the owner pays for now (plans.slug), or null. */
export async function ownerPlanSlug(db: SupabaseClient, ownerId: string): Promise<string | null> {
  const { data: subs } = await db
    .from("subscriptions")
    .select("polar_product_id, status, current_period_end")
    .eq("user_id", ownerId)
    .in("status", ["active", "trialing", "past_due"])
    .limit(5);
  const now = Date.now();
  const live = ((subs ?? []) as { polar_product_id: string; current_period_end: string | null }[]).find(
    (s) => !s.current_period_end || Date.parse(s.current_period_end) > now,
  );
  if (!live) return null;
  const { data: plan } = await db.from("plans").select("slug").eq("polar_product_id", live.polar_product_id).maybeSingle();
  return ((plan as { slug?: string | null } | null)?.slug as string | undefined) ?? null;
}

// ── Workspace rows ─────────────────────────────────────────────────────────

interface WorkspaceRow {
  id: string;
  owner_id: string;
  name: string;
  kind: WorkspaceKind;
}

interface ProfileRow {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_path: string | null;
}

async function profilesOf(db: SupabaseClient, ids: string[]): Promise<Map<string, ProfileRow>> {
  if (!ids.length) return new Map();
  const { data } = await db.from("profiles").select("id, email, display_name, avatar_path").in("id", ids);
  return new Map(((data ?? []) as ProfileRow[]).map((p) => [p.id, p]));
}

async function workspaceOf(db: SupabaseClient, ownerId: string): Promise<WorkspaceRow | null> {
  const { data } = await db.from("workspaces").select("id, owner_id, name, kind").eq("owner_id", ownerId).maybeSingle();
  return (data as WorkspaceRow | null) ?? null;
}

/** The owner's workspace row, created on first use (named after them). */
export async function ensureWorkspace(db: SupabaseClient, ownerId: string): Promise<WorkspaceRow> {
  const existing = await workspaceOf(db, ownerId);
  if (existing) return existing;
  const owner = (await profilesOf(db, [ownerId])).get(ownerId);
  const { error } = await db.rpc("ensure_workspace", { p_owner: ownerId, p_name: defaultWorkspaceName(owner?.display_name, owner?.email) });
  if (error) throw new Error(`ensure_workspace: ${error.message}`);
  const row = await workspaceOf(db, ownerId);
  if (!row) throw new Error("workspace missing after ensure_workspace");
  return row;
}

/** People in the owner's workspace besides the owner (0 before the workspace exists). */
export async function otherMembers(db: SupabaseClient, ownerId: string): Promise<number> {
  const ws = await workspaceOf(db, ownerId).catch(() => null);
  if (!ws) return 0;
  const { count } = await db.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", ws.id).neq("user_id", ownerId);
  return count ?? 0;
}

// ── What the browser lists ─────────────────────────────────────────────────

/** Your own account plus every workspace you were invited to. */
export async function listMyWorkspaces(db: SupabaseClient, user: AuthedUser): Promise<WorkspaceSummary[]> {
  const { data: rows } = await db.from("workspace_members").select("workspace_id, role").eq("user_id", user.id).limit(100);
  const memberships = ((rows ?? []) as { workspace_id: string; role: string }[]).filter((r) => isRole(r.role));
  const ids = memberships.map((m) => m.workspace_id);
  const { data: wsRows } = ids.length
    ? await db.from("workspaces").select("id, owner_id, name, kind").in("id", ids)
    : { data: [] as WorkspaceRow[] };
  const workspaces = (wsRows ?? []) as WorkspaceRow[];
  const own = workspaces.find((w) => w.owner_id === user.id) ?? null;
  const people = await profilesOf(db, [user.id, ...workspaces.map((w) => w.owner_id)]);
  const me = people.get(user.id);

  const list: WorkspaceSummary[] = [
    {
      ownerId: user.id,
      name: own?.name ?? defaultWorkspaceName(me?.display_name, me?.email ?? user.email),
      kind: own?.kind ?? "company",
      role: "owner",
      own: true,
      ownerName: me?.display_name ?? null,
      ownerAvatarUrl: avatarUrl(me?.avatar_path),
    },
  ];
  for (const w of workspaces) {
    if (w.owner_id === user.id) continue;
    const role = memberships.find((m) => m.workspace_id === w.id)?.role;
    const owner = people.get(w.owner_id);
    if (!isRole(role)) continue;
    list.push({
      ownerId: w.owner_id,
      name: w.name,
      kind: w.kind,
      role,
      own: false,
      ownerName: owner?.display_name ?? owner?.email ?? null,
      ownerAvatarUrl: avatarUrl(owner?.avatar_path),
    });
  }
  return list;
}

/** The Team page: members, open invitations (admins only) and seats. */
export async function workspaceView(db: SupabaseClient, actor: Actor): Promise<WorkspaceView> {
  const [ws, plan] = await Promise.all([workspaceOf(db, actor.ownerId), ownerPlanSlug(db, actor.ownerId)]);
  let memberRows: { user_id: string; role: string; created_at: string }[] = [];
  let inviteRows: { id: string; email: string; role: string; invited_by: string | null; created_at: string; expires_at: string }[] = [];
  if (ws) {
    const [m, i] = await Promise.all([
      db.from("workspace_members").select("user_id, role, created_at").eq("workspace_id", ws.id).limit(500),
      atLeast(actor.role, "admin")
        ? db.from("workspace_invites").select("id, email, role, invited_by, created_at, expires_at").eq("workspace_id", ws.id).is("accepted_at", null).order("created_at", { ascending: false }).limit(200)
        : Promise.resolve({ data: [] }),
    ]);
    memberRows = (m.data ?? []) as typeof memberRows;
    inviteRows = (i.data ?? []) as typeof inviteRows;
  }
  if (!memberRows.some((r) => r.user_id === actor.ownerId)) memberRows.unshift({ user_id: actor.ownerId, role: "owner", created_at: "" });

  const people = await profilesOf(db, [...memberRows.map((r) => r.user_id), ...inviteRows.map((r) => r.invited_by).filter((x): x is string => !!x)]);
  const order: Record<WorkspaceRole, number> = { owner: 0, admin: 1, member: 2, viewer: 3 };
  const members: WorkspaceMember[] = memberRows
    .filter((r) => isRole(r.role))
    .map((r) => {
      const p = people.get(r.user_id);
      return {
        userId: r.user_id,
        name: p?.display_name ?? null,
        email: p?.email ?? null,
        avatarUrl: avatarUrl(p?.avatar_path),
        role: r.role as WorkspaceRole,
        joinedAt: r.created_at || null,
        you: r.user_id === actor.user.id,
      };
    })
    .sort((a, b) => order[a.role] - order[b.role] || (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));
  const now = Date.now();
  const invites: WorkspaceInvite[] = inviteRows.map((r) => {
    const by = r.invited_by ? people.get(r.invited_by) : null;
    return {
      id: r.id,
      email: r.email,
      role: r.role as InvitableRole,
      invitedBy: by?.display_name ?? by?.email ?? null,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      expired: Date.parse(r.expires_at) < now,
    };
  });
  const owner = people.get(actor.ownerId);
  return {
    ownerId: actor.ownerId,
    name: ws?.name ?? defaultWorkspaceName(owner?.display_name, owner?.email),
    kind: ws?.kind ?? "company",
    role: actor.role,
    members,
    invites,
    seats: { used: members.length + invites.filter((i) => !i.expired).length, limit: seatLimit(plan), plan },
  };
}

// ── Team changes ───────────────────────────────────────────────────────────

export class TeamError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TeamError";
  }
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(s: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

/** A link token: 32 random bytes, base64url. Only its SHA-256 is stored. */
export function newInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function inviteLink(token: string): string {
  return `${appUrl().replace(/\/+$/, "")}/invite/?t=${encodeURIComponent(token)}`;
}

export function isInviteToken(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(v);
}

/** Rename the workspace or say what kind it is. Admins and the owner. */
export async function updateWorkspace(db: SupabaseClient, actor: Actor, patch: { name?: string; kind?: WorkspaceKind }): Promise<void> {
  const ws = await ensureWorkspace(db, actor.ownerId);
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.kind !== undefined) next.kind = patch.kind;
  const { error } = await db.from("workspaces").update(next).eq("id", ws.id);
  if (error) throw new TeamError(500, "save_failed", "Couldn't save the workspace. Try again in a moment.");
}

/**
 * Invite someone by email. Asking again for someone already invited sends a
 * fresh link (the old one stops working). Admins and the owner, within the
 * plan's seats. Returns the link so it can also be shared by hand.
 */
export async function inviteMember(db: SupabaseClient, actor: Actor, email: string, role: InvitableRole): Promise<{ invite: WorkspaceInvite; link: string; emailed: boolean }> {
  const view = await workspaceView(db, actor);
  if (view.members.some((m) => m.email?.toLowerCase() === email)) throw new TeamError(409, "already_member", `${email} is already in this workspace.`);
  const existing = view.invites.find((i) => i.email === email);
  const seatsTaken = view.seats.used - (existing && !existing.expired ? 1 : 0);
  if (seatsTaken >= view.seats.limit) {
    throw new TeamError(
      402,
      "seats_full",
      view.seats.limit <= 1
        ? "Your plan is for one person. Upgrade to invite your team."
        : `Your plan includes ${view.seats.limit} people and they're all taken. Remove someone or upgrade for more.`,
    );
  }
  const ws = await ensureWorkspace(db, actor.ownerId);
  const token = newInviteToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + 14 * 864e5).toISOString();
  const row = { workspace_id: ws.id, email, role, token_hash: tokenHash, invited_by: actor.user.id, expires_at: expiresAt };
  const res = existing
    ? await db.from("workspace_invites").update({ ...row, created_at: new Date().toISOString() }).eq("id", existing.id).select("id, created_at").single()
    : await db.from("workspace_invites").insert(row).select("id, created_at").single();
  if (res.error || !res.data) throw new TeamError(500, "invite_failed", "Couldn't create the invitation. Try again in a moment.");
  const link = inviteLink(token);

  const inviter = (await profilesOf(db, [actor.user.id])).get(actor.user.id);
  // Emailed by the notify function (supabase/functions/notify); the link is
  // dropped from the row once sent. Best effort: the link above still works.
  const { error: qErr } = await db.from("notifications").insert({
    user_id: actor.ownerId,
    kind: "workspace_invite",
    payload: { to: email, workspace: ws.name, inviter: inviter?.display_name ?? inviter?.email ?? actor.user.email, role, link, expiresAt },
  });
  return {
    invite: {
      id: (res.data as { id: string }).id,
      email,
      role,
      invitedBy: inviter?.display_name ?? inviter?.email ?? null,
      createdAt: (res.data as { created_at: string }).created_at,
      expiresAt,
      expired: false,
    },
    link,
    emailed: !qErr,
  };
}

/** Withdraw an invitation that hasn't been accepted. Admins and the owner. */
export async function revokeInvite(db: SupabaseClient, actor: Actor, inviteId: string): Promise<void> {
  const ws = await workspaceOf(db, actor.ownerId);
  if (!ws) throw new TeamError(404, "not_found", "That invitation doesn't exist any more.");
  const { data } = await db.from("workspace_invites").delete().eq("id", inviteId).eq("workspace_id", ws.id).is("accepted_at", null).select("id");
  if (!data?.length) throw new TeamError(404, "not_found", "That invitation doesn't exist any more.");
}

/** Give a member another role. Admins and the owner; the owner's role never changes here. */
export async function changeRole(db: SupabaseClient, actor: Actor, userId: string, role: InvitableRole): Promise<void> {
  const ws = await workspaceOf(db, actor.ownerId);
  if (!ws || userId === actor.ownerId) throw new TeamError(400, "owner_role", "The owner's role can't be changed.");
  const { data } = await db.from("workspace_members").update({ role }).eq("workspace_id", ws.id).eq("user_id", userId).neq("role", "owner").select("user_id");
  if (!data?.length) throw new TeamError(404, "not_found", "That person isn't in this workspace.");
}

/**
 * Remove someone from the workspace, or leave it yourself. Removing others
 * takes an admin; anyone but the owner can leave.
 */
export async function removeMember(db: SupabaseClient, actor: Actor, userId: string): Promise<void> {
  if (userId === actor.ownerId) throw new TeamError(400, "owner_leave", "The owner can't leave their own workspace.");
  const leaving = userId === actor.user.id;
  if (!leaving && !atLeast(actor.role, "admin")) throw new TeamError(403, "role_required", roleRequiredMessage("admin"));
  const ws = await workspaceOf(db, actor.ownerId);
  if (!ws) throw new TeamError(404, "not_found", "That person isn't in this workspace.");
  const { data } = await db.from("workspace_members").delete().eq("workspace_id", ws.id).eq("user_id", userId).neq("role", "owner").select("user_id");
  if (!data?.length) throw new TeamError(404, "not_found", "That person isn't in this workspace.");
}

// ── Invitation links ───────────────────────────────────────────────────────

/** What a link is for, shown before signing in. Null when the link is unknown. */
export async function previewInvite(db: SupabaseClient, token: string): Promise<InvitePreview | null> {
  const { data } = await db
    .from("workspace_invites")
    .select("email, role, invited_by, expires_at, accepted_at, workspace_id")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  const inv = data as { email: string; role: string; invited_by: string | null; expires_at: string; accepted_at: string | null; workspace_id: string } | null;
  if (!inv) return null;
  const { data: ws } = await db.from("workspaces").select("name").eq("id", inv.workspace_id).maybeSingle();
  const by = inv.invited_by ? (await profilesOf(db, [inv.invited_by])).get(inv.invited_by) : null;
  return {
    workspace: (ws as { name: string } | null)?.name ?? "a workspace",
    inviter: by?.display_name ?? by?.email ?? null,
    role: inv.role as InvitableRole,
    email: inv.email,
    state: inv.accepted_at ? "used" : Date.parse(inv.expires_at) < Date.now() ? "expired" : "open",
  };
}

const ACCEPT_ERRORS: Record<string, [number, string]> = {
  invite_not_found: [404, "This invitation link isn't valid. Ask for a new one."],
  invite_used: [410, "This invitation has already been used."],
  invite_expired: [410, "This invitation has expired. Ask for a new one."],
  invite_email: [403, "This invitation is for a different email address. Sign in with the address it was sent to."],
};

/** Accept a link as the signed-in person; returns the workspace to switch to. */
export async function acceptInvite(db: SupabaseClient, user: AuthedUser, token: string): Promise<WorkspaceSummary> {
  const { data: wsId, error } = await db.rpc("accept_workspace_invite", {
    p_token_hash: await sha256Hex(token),
    p_user: user.id,
    p_email: user.email ?? "",
  });
  if (error || typeof wsId !== "string") {
    const known = Object.keys(ACCEPT_ERRORS).find((k) => error?.message?.includes(k));
    const [status, message] = known ? ACCEPT_ERRORS[known] : [500, "Couldn't accept the invitation. Try again in a moment."];
    throw new TeamError(status, known ?? "accept_failed", message);
  }
  const list = await listMyWorkspaces(db, user);
  const { data: ws } = await db.from("workspaces").select("owner_id").eq("id", wsId).maybeSingle();
  const joined = list.find((w) => w.ownerId === (ws as { owner_id: string } | null)?.owner_id);
  if (!joined) throw new TeamError(500, "accept_failed", "Couldn't open the workspace. Try again in a moment.");
  return joined;
}

/** Turns a TeamError into the API's error shape; rethrows anything else. */
export function teamErrorResponse(e: unknown): NextResponse {
  if (e instanceof TeamError) return jsonError(e.status, e.code, e.message);
  throw e;
}
