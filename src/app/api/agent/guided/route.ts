import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR, jsonError } from "@/lib/agent/http";
import { createLlmPort } from "@/lib/agent/llm";
import { createGuidedRun, GuidedError } from "@/lib/agent/guided/service";
import { requireActor } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/agent/guided — the user's guided fix lists (newest first). */
export async function GET(req: Request) {
  if (!agentEnabled()) return ERR.disabled();
  const r = await requireActor(req, "viewer");
  if ("error" in r) return r.error;
  const { actor } = r;
  const { data, error } = await getServiceDb()
    .from("guided_runs")
    .select("id, site_url, platform, live_count, total_count, last_checked_at, created_at, scan_id, report_id")
    .eq("user_id", actor.ownerId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return jsonError(500, "internal", "Could not load guided fixes.");
  return NextResponse.json({ runs: data ?? [] });
}

/**
 * POST /api/agent/guided { scanId } | { jobId }
 * Guided fixes for any site (WordPress, Shopify, Wix, Squarespace, Webflow,
 * Framer… or code that isn't on GitHub): values to paste + the clicks on
 * that platform + a live check. From a saved scan: free, 3 a day. From a
 * report (jobId = the analysis job): included with the report.
 */
export async function POST(req: Request) {
  if (!agentEnabled()) return ERR.disabled();
  const r = await requireActor(req, "member");
  if ("error" in r) return r.error;
  const { actor } = r;
  let body: { scanId?: string; jobId?: string };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest("Invalid JSON body.");
  }
  if (!body.scanId && !body.jobId) return ERR.badRequest("scanId (saved free scan) or jobId (analysis job) is required.");
  if ((body.scanId && !UUID.test(body.scanId)) || (body.jobId && !UUID.test(body.jobId))) return ERR.badRequest("Not a valid id.");
  const db = getServiceDb();
  let source: { scanId: string } | { reportId: string };
  if (body.jobId) {
    const { data: report } = await db.from("reports").select("id, user_id").eq("job_id", body.jobId).maybeSingle();
    if (!report || report.user_id !== actor.ownerId) return ERR.notFound("report");
    source = { reportId: report.id };
  } else {
    source = { scanId: body.scanId! };
  }
  try {
    const run = await createGuidedRun(db, createLlmPort(db), fetch, actor.ownerId, source);
    return NextResponse.json({ run }, { status: 201 });
  } catch (e) {
    if (e instanceof GuidedError) {
      const status = e.code === "not_found" ? 404 : e.code === "rate_limited" ? 429 : 422;
      return jsonError(status, e.code, e.message);
    }
    console.error(JSON.stringify({ level: "error", msg: "guided run failed", error: String(e).slice(0, 300) }));
    return jsonError(500, "internal", "Could not build the guided fixes. Try again in a minute.");
  }
}
