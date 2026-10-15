import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { ERR } from "@/lib/agent/http";
import { cleanClientInput, clientsView, createClient } from "@/lib/agency/server";
import { requireActor, teamErrorResponse } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/** GET /api/clients/ — the Clients page: branding, clients with their sites and links, unassigned sites. */
export async function GET(req: Request) {
  const r = await requireActor(req, "viewer");
  if ("error" in r) return r.error;
  return NextResponse.json(await clientsView(getServiceDb(), r.actor));
}

/** POST /api/clients/ { name, website?, contactEmail? } — add a client. Members and up. */
export async function POST(req: Request) {
  const r = await requireActor(req, "member");
  if ("error" in r) return r.error;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return ERR.badRequest("Invalid JSON body.");
  try {
    const db = getServiceDb();
    const id = await createClient(db, r.actor, cleanClientInput(body, true));
    return NextResponse.json({ id, view: await clientsView(db, r.actor) }, { status: 201 });
  } catch (e) {
    return teamErrorResponse(e);
  }
}
