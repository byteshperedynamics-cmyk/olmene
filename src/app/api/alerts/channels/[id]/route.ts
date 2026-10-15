import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { ERR } from "@/lib/agent/http";
import { ALERT_KINDS } from "@/lib/alerts";
import { requireActor } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/** PATCH /api/alerts/channels/[id] { kinds?, active?, label? } — which events go to this channel; resume a paused one. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireActor(req, "admin");
  if ("error" in r) return r.error;
  const { actor } = r;
  const { id } = await ctx.params;
  let body: { kinds?: string[]; active?: boolean; label?: string };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest("Invalid JSON body.");
  }
  const patch: Record<string, unknown> = {};
  if (Array.isArray(body.kinds)) patch.kinds = body.kinds.filter((k) => (ALERT_KINDS as readonly string[]).includes(k));
  if (typeof body.active === "boolean") Object.assign(patch, { active: body.active, ...(body.active ? { failures: 0, last_error: null } : {}) });
  if (typeof body.label === "string") patch.label = body.label.slice(0, 60) || null;
  const { data } = await getServiceDb().from("alert_channels").update(patch).eq("id", id).eq("user_id", actor.ownerId).select("id").maybeSingle();
  if (!data) return ERR.notFound("channel");
  return NextResponse.json({ ok: true });
}

/** DELETE /api/alerts/channels/[id] */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const r = await requireActor(req, "admin");
  if ("error" in r) return r.error;
  const { actor } = r;
  const { id } = await ctx.params;
  await getServiceDb().from("alert_channels").delete().eq("id", id).eq("user_id", actor.ownerId);
  return NextResponse.json({ ok: true });
}
