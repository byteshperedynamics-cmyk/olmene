import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { ERR } from "@/lib/agent/http";
import { clientsView, createPortal, deletePortal } from "@/lib/agency/server";
import { isUuid } from "@/lib/workspace/roles";
import { requireActor, teamErrorResponse } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/** POST /api/clients/[id]/portal — turn on the client's page (or return the one that's on). Members and up. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireActor(req, "member");
  if ("error" in r) return r.error;
  const { id } = await ctx.params;
  if (!isUuid(id)) return ERR.notFound("client");
  try {
    const db = getServiceDb();
    const portal = await createPortal(db, r.actor, id);
    return NextResponse.json({ portal, view: await clientsView(db, r.actor) }, { status: 201 });
  } catch (e) {
    return teamErrorResponse(e);
  }
}

/** DELETE /api/clients/[id]/portal — turn the page off; the link stops working at once. Members and up. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireActor(req, "member");
  if ("error" in r) return r.error;
  const { id } = await ctx.params;
  if (!isUuid(id)) return ERR.notFound("client");
  const db = getServiceDb();
  await deletePortal(db, r.actor, id);
  return NextResponse.json({ view: await clientsView(db, r.actor) });
}
