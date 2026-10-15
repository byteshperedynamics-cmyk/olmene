import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { ERR } from "@/lib/agent/http";
import { cleanBrandInput, clientsView, updateBrand } from "@/lib/agency/server";
import { requireActor, teamErrorResponse } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/** PATCH /api/workspace/brand/ { name?, color?, url?, whiteLabel? } — how client pages look. Admins and the owner. */
export async function PATCH(req: Request) {
  const r = await requireActor(req, "admin");
  if ("error" in r) return r.error;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return ERR.badRequest("Invalid JSON body.");
  try {
    const db = getServiceDb();
    await updateBrand(db, r.actor, cleanBrandInput(body));
    return NextResponse.json({ view: await clientsView(db, r.actor) });
  } catch (e) {
    return teamErrorResponse(e);
  }
}
