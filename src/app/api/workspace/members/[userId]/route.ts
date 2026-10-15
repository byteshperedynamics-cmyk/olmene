import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { ERR, jsonError } from "@/lib/agent/http";
import { isInvitableRole, isUuid } from "@/lib/workspace/roles";
import { changeRole, removeMember, requireActor, teamErrorResponse } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/** PATCH /api/workspace/members/[userId] { role } — Admin, Member or Viewer. Admins and the owner. */
export async function PATCH(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const r = await requireActor(req, "admin");
  if ("error" in r) return r.error;
  const { userId } = await ctx.params;
  if (!isUuid(userId)) return ERR.notFound("member");
  const body = (await req.json().catch(() => null)) as { role?: unknown } | null;
  if (!isInvitableRole(body?.role)) return jsonError(400, "bad_role", "Choose Admin, Member or Viewer.");
  try {
    await changeRole(getServiceDb(), r.actor, userId, body.role);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return teamErrorResponse(e);
  }
}

/** DELETE /api/workspace/members/[userId] — remove someone (admins), or leave yourself (anyone but the owner). */
export async function DELETE(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const r = await requireActor(req, "viewer");
  if ("error" in r) return r.error;
  const { userId } = await ctx.params;
  if (!isUuid(userId)) return ERR.notFound("member");
  try {
    await removeMember(getServiceDb(), r.actor, userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return teamErrorResponse(e);
  }
}
