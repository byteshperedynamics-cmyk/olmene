import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR } from "@/lib/agent/http";
import { readFlags } from "@/lib/agent/audit";
import { loadGithubAppConfig } from "@/lib/agent/github/client";
import { kickAgentJob } from "@/lib/agent/drive";
import { requireActor } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["queued", "planning", "previewing", "applying", "verifying"];

/**
 * GET /api/agent/jobs — the user's fix jobs (most recent first).
 */
export async function GET(req: Request) {
  if (!agentEnabled()) return ERR.disabled();
  const r = await requireActor(req, "viewer");
  if ("error" in r) return r.error;
  const { actor } = r;

  const db = getServiceDb();
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 50);

  const { data: jobs, error } = await db
    .from("agent_jobs")
    .select("id, status, current_step, input, step_outputs, error, created_at, completed_at, report_id, scan_id, pr_number, pr_url, pr_state, merged_at")
    .eq("user_id", actor.ownerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    return NextResponse.json({ error: { code: "internal", message: "Could not load jobs." } }, { status: 500 });
  }

  // step_outputs.plan contains copy drafts — strip them; the client never needs raw copy.
  const safe = (jobs ?? []).map((j: Record<string, unknown>) => {
    const so = (j.step_outputs ?? {}) as Record<string, unknown>;
    if (so.plan && typeof so.plan === "object") {
      const { copy, ...rest } = so.plan as Record<string, unknown>;
      return { ...j, step_outputs: { ...so, plan: { ...rest, copyKeys: copy ? Object.keys(copy as object) : [] } } };
    }
    return j;
  });

  return NextResponse.json({ jobs: safe });
}

/** Free previews from a scan: per user per day (planning costs one small AI call). */
const SCAN_PREVIEWS_PER_DAY = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/agent/jobs  { jobId, targetRepo } | { scanId, targetRepo }
 * Creates a fix job against one of the repos on the user's GitHub connection,
 * planned from either a completed analysis (jobId = the analysis job whose
 * report should be applied) or a saved free scan (scanId: the free preview —
 * no report needed). Planning + preview are free for everyone; the approve
 * endpoint enforces the paid entitlement. The run starts moving immediately
 * and keeps moving without the tab (cron driver).
 */
export async function POST(req: Request) {
  if (!agentEnabled()) return ERR.disabled();
  const r = await requireActor(req, "member");
  if ("error" in r) return r.error;
  const { actor } = r;

  let body: { jobId?: string; scanId?: string; targetRepo?: string };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest("Invalid JSON body.");
  }
  const { jobId, scanId, targetRepo } = body;
  if ((!jobId && !scanId) || !targetRepo) return ERR.badRequest("targetRepo and either jobId (analysis job) or scanId (saved free scan) are required.");
  if (scanId && !UUID.test(scanId)) return ERR.badRequest("scanId is not a valid scan id.");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(targetRepo)) {
    return ERR.badRequest("targetRepo must look like owner/repo.");
  }

  const db = getServiceDb();

  const flags = await readFlags(db);
  if (flags.globalKillSwitch || !flags.providerGithubEnabled) {
    return ERR.badRequest("The fix agent is temporarily disabled by the operator.");
  }
  const app = await loadGithubAppConfig(db);
  if (!app) return ERR.notConfigured();

  // Plan source: a report (owner-checked via its analysis job) or a saved scan.
  let reportId: string | null = null;
  let scanRowId: string | null = null;
  if (jobId) {
    const { data: report } = await db
      .from("reports")
      .select("id, user_id, job_id")
      .eq("job_id", jobId)
      .maybeSingle();
    if (!report || report.user_id !== actor.ownerId) return ERR.notFound("report");
    reportId = report.id;
  } else {
    const { data: scan } = await db.from("scans").select("id, user_id, expires_at").eq("id", scanId!).maybeSingle();
    if (!scan || (scan.user_id && scan.user_id !== actor.ownerId) || (scan.expires_at && new Date(scan.expires_at) < new Date())) {
      return ERR.notFound("scan");
    }
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const { count: previews } = await db
      .from("agent_jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", actor.ownerId)
      .not("scan_id", "is", null)
      .gte("created_at", dayAgo);
    if ((previews ?? 0) >= SCAN_PREVIEWS_PER_DAY) {
      return NextResponse.json(
        { error: { code: "rate_limited", message: `You've used today's ${SCAN_PREVIEWS_PER_DAY} free previews. Try again tomorrow, or run a full report.` } },
        { status: 429 },
      );
    }
    // The scan now belongs to this user and no longer expires.
    await db.from("scans").update({ user_id: actor.ownerId, expires_at: null }).eq("id", scan.id);
    scanRowId = scan.id;
  }

  // Active GitHub connection + repo allowlist
  const { data: connection } = await db
    .from("connections")
    .select("id, status, resource_ids")
    .eq("user_id", actor.ownerId)
    .eq("provider", "github")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!connection) {
    return ERR.badRequest("Connect your GitHub account first (Agent page → Connect GitHub).");
  }
  const repos = (connection.resource_ids as string[] | null) ?? [];
  if (repos.length > 0 && !repos.includes(targetRepo)) {
    return ERR.badRequest(
      `${targetRepo} is not accessible through your GitHub connection. Install the Olmene app on that repository, then reconnect.`,
    );
  }

  // One active agent job at a time
  const { count: activeCount } = await db
    .from("agent_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", actor.ownerId)
    .in("status", ACTIVE_STATUSES);
  if ((activeCount ?? 0) > 0) {
    return ERR.badRequest("You already have a fix job running. Wait for it to finish first.");
  }

  // 10 job starts per hour per user
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recent } = await db
    .from("agent_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", actor.ownerId)
    .gte("created_at", hourAgo);
  if ((recent ?? 0) >= 10) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: "Too many fix jobs started this hour. Try again later." } },
      { status: 429 },
    );
  }

  const { data: job, error } = await db
    .from("agent_jobs")
    .insert({
      user_id: actor.ownerId,
      created_by: actor.user.id,
      report_id: reportId,
      scan_id: scanRowId,
      connection_id: connection.id,
      provider: "github",
      status: "queued",
      current_step: null,
      input: { targetRepo },
    })
    .select("id")
    .single();
  if (error || !job) {
    return NextResponse.json({ error: { code: "internal", message: "Could not create the job." } }, { status: 500 });
  }

  await db.from("agent_actions").insert({
    agent_job_id: job.id,
    user_id: actor.ownerId,
    actor: "user",
    action_type: "plan",
    provider: "github",
    result: "success",
    target: { repo: targetRepo, report: reportId, scan: scanRowId },
    detail: { started: true, by: actor.user.id, source: reportId ? "report" : "scan" },
  });

  kickAgentJob(job.id);
  return NextResponse.json({ jobId: job.id });
}
