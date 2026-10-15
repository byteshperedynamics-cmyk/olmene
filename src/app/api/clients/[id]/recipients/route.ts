import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { ERR } from "@/lib/agent/http";
import { addRecipient, clientsView } from "@/lib/agency/server";
import { isUuid } from "@/lib/workspace/roles";
import { requireActor, teamErrorResponse } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/** POST /api/clients/[id]/recipients { email } — add someone to the client's emailed report. Members and up. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireActor(req, "member");
  if ("error" in r) return r.error;
  const { id } = await ctx.params;
  if (!isUuid(id)) return ERR.notFound("client");
  const body = (await req.json().catch(() => null)) as {
    email?: unknown;
  } | null;
  if (!body) return ERR.badRequest("Invalid JSON body.");
  try {
    const db = getServiceDb();
    await addRecipient(db, r.actor, id, body.email);
    return NextResponse.json({ view: await clientsView(db, r.actor) }, { status: 201 });
  } catch (e) {
    return teamErrorResponse(e);
  }
}
