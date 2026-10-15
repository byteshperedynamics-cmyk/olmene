// Workspaces in the edge functions: a signed-in person may act for another
// account they're a member of (migration 20261022_workspaces.sql). Mirrors
// src/lib/workspace/roles.ts on the Worker.

type Role = "owner" | "admin" | "member" | "viewer";
const RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class WorkspaceAccessError extends Error {
  constructor(readonly code: "not_a_member" | "role_required", message: string) {
    super(message);
    this.name = "WorkspaceAccessError";
  }
}

// deno-lint-ignore no-explicit-any
type Db = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> };

/** The signed-in person's role on an owner's data: owner for their own account, else their membership role, else null. */
export async function roleOn(db: Db, ownerId: string, userId: string): Promise<Role | null> {
  if (ownerId === userId) return "owner";
  const { data, error } = await db.rpc("workspace_role", { p_owner: ownerId, p_user: userId });
  return !error && typeof data === "string" && data in RANK ? (data as Role) : null;
}

/**
 * Whose account a request acts for: `requested` (a workspace owner's user id
 * from the request body) when the person is at least `need` there, otherwise
 * their own. Throws WorkspaceAccessError when they asked for a workspace they
 * can't act in, so a mistake never lands work in the wrong account.
 */
export async function actingOwner(db: Db, userId: string, requested: unknown, need: Role = "member"): Promise<string> {
  if (requested === undefined || requested === null || requested === "" || requested === userId) return userId;
  if (typeof requested !== "string" || !UUID.test(requested)) {
    throw new WorkspaceAccessError("not_a_member", "That workspace isn't valid. Switch workspaces and try again.");
  }
  const role = await roleOn(db, requested, userId);
  if (!role) throw new WorkspaceAccessError("not_a_member", "You're not a member of that workspace any more.");
  if (RANK[role] < RANK[need]) {
    throw new WorkspaceAccessError("role_required", "Viewers can look but not change anything. Ask an admin for the Member role.");
  }
  return requested;
}
