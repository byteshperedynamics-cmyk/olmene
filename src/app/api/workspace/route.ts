import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { ERR, jsonError } from "@/lib/agent/http";
import { requireActor, teamErrorResponse, updateWorkspace, workspaceView } from "@/lib/workspace/server";
import type { WorkspaceKind } from "@/lib/workspace/types";

export const dynamic = "force-dynamic";

/** GET /api/workspace/ — the Team page for the workspace you're in: members, invitations (admins), seats. */
export async function GET(req: Request) {
  const r = await requireActor(req, "viewer");
  if ("error" in r) return r.error;
  return NextResponse.json({ workspace: await workspaceView(getServiceDb(), r.actor) });
}

/** PATCH /api/workspace/ { name?, kind? } — rename it, or say it's a company or an agency. Admins and the owner. */
export async function PATCH(req: Request) {
  const r = await requireActor(req, "admin");
  if ("error" in r) return r.error;
  const body = (await req.json().catch(() => null)) as { name?: unknown; kind?: unknown } | null;
  if (!body) return ERR.badRequest("Invalid JSON body.");
  const patch: { name?: string; kind?: WorkspaceKind } = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim() : "";
    if (!name || name.length > 80) return jsonError(400, "bad_name", "Give the workspace a name of up to 80 characters.");
    patch.name = name;
  }
  if (body.kind !== undefined) {
    if (body.kind !== "company" && body.kind !== "agency") return ERR.badRequest("kind is company or agency.");
    patch.kind = body.kind;
  }
  if (!Object.keys(patch).length) return ERR.badRequest("Nothing to update.");
  try {
    const db = getServiceDb();
    await updateWorkspace(db, r.actor, patch);
    return NextResponse.json({ workspace: await workspaceView(db, r.actor) });
  } catch (e) {
    return teamErrorResponse(e);
  }
}
