import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { ERR } from "@/lib/agent/http";
import { clientsView, removeRecipient } from "@/lib/agency/server";
import { isUuid } from "@/lib/workspace/roles";
import { requireActor, teamErrorResponse } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/** DELETE /api/clients/[id]/recipients/[recipientId] — take someone off the report (not those who unsubscribed). Members and up. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; recipientId: string }> }) {
  const r = await requireActor(req, "member");
  if ("error" in r) return r.error;
  const { id, recipientId } = await ctx.params;
  if (!isUuid(id) || !isUuid(recipientId)) return ERR.notFound("recipient");
  try {
    const db = getServiceDb();
    await removeRecipient(db, r.actor, id, recipientId);
    return NextResponse.json({ view: await clientsView(db, r.actor) });
  } catch (e) {
    return teamErrorResponse(e);
  }
}
