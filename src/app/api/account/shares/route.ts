import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { ERR, jsonError } from "@/lib/agent/http";
import { newShareSlug } from "@/lib/account/progress";
import { requireActor } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

type Body = { siteId?: unknown; showName?: unknown };

async function readBody(req: Request): Promise<Body | null> {
  return (await req.json().catch(() => null)) as Body | null;
}

/**
 * POST /api/account/shares/ { siteId, showName? } — turns on the public
 * progress link for one of your sites (or returns the one that's already on).
 */
export async function POST(req: Request) {
  const r = await requireActor(req, "member");
  if ("error" in r) return r.error;
  const { actor } = r;
  const body = await readBody(req);
  if (typeof body?.siteId !== "string") return ERR.badRequest("siteId is required.");
  const db = getServiceDb();
  const { data: site } = await db.from("sites").select("id, user_id").eq("id", body.siteId).maybeSingle();
  if (!site || site.user_id !== actor.ownerId) return ERR.notFound("site");

  const { data: existing } = await db.from("progress_shares").select("slug, show_name, views, created_at").eq("site_id", site.id).maybeSingle();
  if (existing) return NextResponse.json({ share: existing });

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await db
      .from("progress_shares")
      .insert({ user_id: actor.ownerId, site_id: site.id, slug: newShareSlug(), show_name: body.showName !== false })
      .select("slug, show_name, views, created_at")
      .single();
    if (!error) return NextResponse.json({ share: data }, { status: 201 });
    if (error.code !== "23505") break; // only a slug collision is worth retrying
  }
  return jsonError(500, "share_failed", "Couldn't create the link. Try again in a moment.");
}

/** PATCH /api/account/shares/ { siteId, showName } — show or hide your name and photo on the link. */
export async function PATCH(req: Request) {
  const r = await requireActor(req, "member");
  if ("error" in r) return r.error;
  const { actor } = r;
  const body = await readBody(req);
  if (typeof body?.siteId !== "string" || typeof body.showName !== "boolean") return ERR.badRequest("siteId and showName are required.");
  const { data } = await getServiceDb()
    .from("progress_shares")
    .update({ show_name: body.showName })
    .eq("site_id", body.siteId)
    .eq("user_id", actor.ownerId)
    .select("slug, show_name, views, created_at")
    .maybeSingle();
  if (!data) return ERR.notFound("link");
  return NextResponse.json({ share: data });
}

/** DELETE /api/account/shares/ { siteId } — turns the link off; it stops working at once. */
export async function DELETE(req: Request) {
  const r = await requireActor(req, "member");
  if ("error" in r) return r.error;
  const { actor } = r;
  const body = await readBody(req);
  if (typeof body?.siteId !== "string") return ERR.badRequest("siteId is required.");
  await getServiceDb().from("progress_shares").delete().eq("site_id", body.siteId).eq("user_id", actor.ownerId);
  return NextResponse.json({ ok: true });
}
