import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { ERR } from "@/lib/agent/http";
import { cleanClientInput, clientsView, deleteClient, updateClient } from "@/lib/agency/server";
import { isUuid } from "@/lib/workspace/roles";
import { requireActor, teamErrorResponse } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/** PATCH /api/clients/[id] { name?, website?, contactEmail? } — members and up. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireActor(req, "member");
  if ("error" in r) return r.error;
  const { id } = await ctx.params;
  if (!isUuid(id)) return ERR.notFound("client");
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return ERR.badRequest("Invalid JSON body.");
  try {
    const db = getServiceDb();
    await updateClient(db, r.actor, id, cleanClientInput(body, false));
    return NextResponse.json({ view: await clientsView(db, r.actor) });
  } catch (e) {
    return teamErrorResponse(e);
  }
}

/** DELETE /api/clients/[id] — remove the client (its sites stay, its page stops working). Admins and the owner. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireActor(req, "admin");
  if ("error" in r) return r.error;
  const { id } = await ctx.params;
  if (!isUuid(id)) return ERR.notFound("client");
  try {
    const db = getServiceDb();
    await deleteClient(db, r.actor, id);
    return NextResponse.json({ view: await clientsView(db, r.actor) });
  } catch (e) {
    return teamErrorResponse(e);
  }
}
