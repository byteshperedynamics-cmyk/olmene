import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR, jsonError } from "@/lib/agent/http";
import { attachAutoPlans, CHANNEL_PLATFORMS, loadSiteConnection } from "@/lib/agent/channels";
import type { GuidedRunRow } from "@/lib/agent/guided/service";
import { requireActor } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/** POST /api/agent/guided/[id]/auto — after connecting Webflow/WordPress: find which cards Olmene can apply for you. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!agentEnabled()) return ERR.disabled();
  const r = await requireActor(req, "member");
  if ("error" in r) return r.error;
  const { actor } = r;
  const { id } = await ctx.params;
  const db = getServiceDb();
  const { data } = await db.from("guided_runs").select("*").eq("id", id).maybeSingle();
  const run = data as GuidedRunRow | null;
  if (!run || run.user_id !== actor.ownerId) return ERR.notFound("guided fix list");
  const provider = CHANNEL_PLATFORMS[run.platform_id ?? ""];
  if (!provider) return jsonError(422, "no_channel", "Automatic changes are available for Webflow and WordPress sites.");
  const conn = await loadSiteConnection(db, actor.ownerId, provider, run.site_url);
  if (!conn) return jsonError(409, "not_connected", `Connect ${provider === "webflow" ? "Webflow" : "WordPress"} first.`);
  try {
    const fixes = await attachAutoPlans(conn, run.site_url, run.fixes, fetch);
    await db.from("guided_runs").update({ fixes, connection_id: conn.id, updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ run: { ...run, fixes, connection_id: conn.id } });
  } catch (e) {
    return jsonError(502, "channel_failed", e instanceof Error ? e.message.slice(0, 200) : "The platform didn't answer.");
  }
}
