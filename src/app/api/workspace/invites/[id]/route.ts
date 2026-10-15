import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { ERR } from "@/lib/agent/http";
import { isUuid } from "@/lib/workspace/roles";
import { requireActor, revokeInvite, teamErrorResponse } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/** DELETE /api/workspace/invites/[id] — withdraw an invitation; its link stops working at once. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireActor(req, "admin");
  if ("error" in r) return r.error;
  const { id } = await ctx.params;
  if (!isUuid(id)) return ERR.notFound("invitation");
  try {
    await revokeInvite(getServiceDb(), r.actor, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return teamErrorResponse(e);
  }
}
