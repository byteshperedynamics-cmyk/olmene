import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR, jsonError, requireUser } from "@/lib/agent/http";
import { checkApplyEntitlement } from "@/lib/agent/entitlement";
import { writeAudit } from "@/lib/agent/audit";
import { CHANNEL_PLATFORMS, loadSiteConnection, runAutoChanges } from "@/lib/agent/channels";
import type { GuidedRunRow } from "@/lib/agent/guided/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/guided/[id]/apply { fixIds: string[] | "all" }
 * The human gate for API channels: applies the approved cards' automatic
 * changes on Webflow/WordPress (paid plans), keeping the old values for undo.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  let body: { fixIds?: string[] | "all" };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest("Invalid JSON body.");
  }
  const db = getServiceDb();
  const { data } = await db.from("guided_runs").select("*").eq("id", id).maybeSingle();
  const run = data as GuidedRunRow | null;
  if (!run || run.user_id !== auth.user.id) return ERR.notFound("guided fix list");
  const entitlement = await checkApplyEntitlement(db, auth.user.id);
  if (!entitlement.allowed) {
    return jsonError(402, entitlement.code ?? "plan_required", entitlement.message ?? "A subscription is required to apply fixes for you.");
  }
  const provider = CHANNEL_PLATFORMS[run.platform_id ?? ""];
  const conn = provider ? await loadSiteConnection(db, auth.user.id, provider, run.site_url) : null;
  if (!conn) return jsonError(409, "not_connected", "Connect the platform first.");
  const ids = body.fixIds === "all" ? run.fixes.filter((f) => f.auto).map((f) => f.id) : (body.fixIds ?? []).filter((x) => typeof x === "string");
  if (!ids.length) return ERR.badRequest("fixIds is required.");
  const fixes = await runAutoChanges(conn, run.fixes, ids, "apply", fetch);
  await db.from("guided_runs").update({ fixes, updated_at: new Date().toISOString() }).eq("id", id);
  await writeAudit(db, {
    user_id: auth.user.id, actor: "user", action_type: "channel_apply", provider: conn.provider, result: fixes.some((f) => ids.includes(f.id) && f.auto?.applied?.ok) ? "success" : "failure",
    target: { guidedRunId: id, host: conn.host }, detail: { fixIds: ids, errors: fixes.filter((f) => ids.includes(f.id) && f.auto?.applied?.error).map((f) => f.auto!.applied!.error) },
  });
  return NextResponse.json({ run: { ...run, fixes } });
}
