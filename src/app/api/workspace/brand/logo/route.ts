import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { jsonError } from "@/lib/agent/http";
import { clientsView, removeBrandLogo, setBrandLogo } from "@/lib/agency/server";
import { requireActor, teamErrorResponse } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

const MAX = 524_288;

/** POST /api/workspace/brand/logo/ (image/png, image/jpeg or image/webp; at most 512 KB) — admins and the owner. */
export async function POST(req: Request) {
  const r = await requireActor(req, "admin");
  if ("error" in r) return r.error;
  const ctype = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp"].includes(ctype)) return jsonError(415, "bad_image", "Use a PNG, JPEG or WebP logo.");
  if (Number(req.headers.get("content-length") ?? "0") > MAX) return jsonError(413, "too_large", "Logos can be up to 512 KB. Export a smaller PNG or WebP.");
  try {
    const db = getServiceDb();
    await setBrandLogo(db, r.actor, new Uint8Array(await req.arrayBuffer()));
    return NextResponse.json({ view: await clientsView(db, r.actor) });
  } catch (e) {
    return teamErrorResponse(e);
  }
}

/** DELETE /api/workspace/brand/logo/ — back to the name only. */
export async function DELETE(req: Request) {
  const r = await requireActor(req, "admin");
  if ("error" in r) return r.error;
  const db = getServiceDb();
  await removeBrandLogo(db, r.actor);
  return NextResponse.json({ view: await clientsView(db, r.actor) });
}
