import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { jsonError } from "@/lib/agent/http";
import { isInvitableRole, normalizeEmail } from "@/lib/workspace/roles";
import { inviteMember, requireActor, teamErrorResponse } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/workspace/invites/ { email, role } — invite someone (admins and
 * the owner, within the plan's seats). Emails them a link and returns it too,
 * so it can be shared by hand. Inviting the same address again sends a fresh link.
 */
export async function POST(req: Request) {
  const r = await requireActor(req, "admin");
  if ("error" in r) return r.error;
  const body = (await req.json().catch(() => null)) as { email?: unknown; role?: unknown } | null;
  const email = normalizeEmail(body?.email);
  if (!email) return jsonError(400, "bad_email", "Enter a valid email address.");
  if (!isInvitableRole(body?.role)) return jsonError(400, "bad_role", "Choose Admin, Member or Viewer.");
  if (email === r.actor.user.email?.toLowerCase()) return jsonError(400, "self_invite", "That's you. Invite someone else.");
  try {
    return NextResponse.json(await inviteMember(getServiceDb(), r.actor, email, body.role), { status: 201 });
  } catch (e) {
    return teamErrorResponse(e);
  }
}
