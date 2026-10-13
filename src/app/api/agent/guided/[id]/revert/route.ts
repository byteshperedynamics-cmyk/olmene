import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR, jsonError, requireUser } from "@/lib/agent/http";
import { writeAudit } from "@/lib/agent/audit";
import { CHANNEL_PLATFORMS, loadSiteConnection, runAutoChanges } from "@/lib/agent/channels";
import type { GuidedRunRow } from "@/lib/agent/guided/service";

export const dynamic = "force-dynamic";

/** POST /api/agent/guided/[id]/revert { fixIds } — put back the values Olmene replaced. Always allowed (no plan needed to undo). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  let body: { fixIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest("Invalid JSON body.");
  }
  const db = getServiceDb();
  const { data } = await db.from("guided_runs").select("*").eq("id", id).maybeSingle();
  const run = data as GuidedRunRow | null;
  if (!run || run.user_id !== auth.user.id) return ERR.notFound("guided fix list");
  const provider = CHANNEL_PLATFORMS[run.platform_id ?? ""];
  const conn = provider ? await loadSiteConnection(db, auth.user.id, provider, run.site_url) : null;
  if (!conn) return jsonError(409, "not_connected", "Reconnect the platform to undo, or restore the old values by hand (they're on each card).");
  const ids = (body.fixIds ?? []).filter((x) => typeof x === "string");
  if (!ids.length) return ERR.badRequest("fixIds is required.");
  const fixes = await runAutoChanges(conn, run.fixes, ids, "revert", fetch);
  await db.from("guided_runs").update({ fixes, updated_at: new Date().toISOString() }).eq("id", id);
  await writeAudit(db, { user_id: auth.user.id, actor: "user", action_type: "channel_revert", provider: conn.provider, result: "success", target: { guidedRunId: id, host: conn.host }, detail: { fixIds: ids } });
  return NextResponse.json({ run: { ...run, fixes } });
}
