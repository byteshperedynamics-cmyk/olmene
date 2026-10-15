import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { ERR } from "@/lib/agent/http";
import { assignSite, clientsView } from "@/lib/agency/server";
import { isUuid } from "@/lib/workspace/roles";
import { requireActor, teamErrorResponse } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/** PUT /api/sites/[id]/client { clientId: string | null } — which client a site belongs to. Members and up. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireActor(req, "member");
  if ("error" in r) return r.error;
  const { id } = await ctx.params;
  if (!isUuid(id)) return ERR.notFound("site");
  const body = (await req.json().catch(() => null)) as { clientId?: unknown } | null;
  const clientId = body?.clientId ?? null;
  if (clientId !== null && !isUuid(clientId)) return ERR.badRequest("clientId is a client id or null.");
  try {
    const db = getServiceDb();
    await assignSite(db, r.actor, id, clientId);
    return NextResponse.json({ view: await clientsView(db, r.actor) });
  } catch (e) {
    return teamErrorResponse(e);
  }
}
