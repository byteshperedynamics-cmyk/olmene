import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR, requireUser } from "@/lib/agent/http";
import { readFlags } from "@/lib/agent/audit";
import { loadGithubAppConfig } from "@/lib/agent/github/client";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["queued", "planning", "previewing", "applying", "verifying"];

/**
 * GET /api/agent/jobs — the user's fix jobs (most recent first).
 */
export async function GET(req: Request) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const db = getServiceDb();
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 50);

  const { data: jobs, error } = await db
    .from("agent_jobs")
    .select("id, status, current_step, input, step_outputs, error, created_at, completed_at, report_id")
    .eq("user_id", auth.user.id)
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

/**
 * POST /api/agent/jobs  { jobId, targetRepo }
 * Creates a fix job for one of the user's completed analyses (jobId = the
 * analysis job whose report should be applied) against one of the repos on
 * their GitHub connection. Planning + preview are free for everyone; the
 * approve endpoint enforces the paid entitlement.
 */
export async function POST(req: Request) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  let body: { jobId?: string; targetRepo?: string };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest("Invalid JSON body.");
  }
  const { jobId, targetRepo } = body;
  if (!jobId || !targetRepo) return ERR.badRequest("jobId (analysis job) and targetRepo are required.");
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

  // Report ownership — resolve via the analysis job (owner-checked)
  const { data: report } = await db
    .from("reports")
    .select("id, user_id, job_id")
    .eq("job_id", jobId)
    .maybeSingle();
  if (!report || report.user_id !== auth.user.id) return ERR.notFound("report");

  // Active GitHub connection + repo allowlist
  const { data: connection } = await db
    .from("connections")
    .select("id, status, resource_ids")
    .eq("user_id", auth.user.id)
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
      `${targetRepo} is not accessible through your GitHub connection. Install the MarketWise app on that repository, then reconnect.`,
    );
  }

  // One active agent job at a time
  const { count: activeCount } = await db
    .from("agent_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.user.id)
    .in("status", ACTIVE_STATUSES);
  if ((activeCount ?? 0) > 0) {
    return ERR.badRequest("You already have a fix job running. Wait for it to finish first.");
  }

  // 10 job starts per hour per user
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recent } = await db
    .from("agent_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.user.id)
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
      user_id: auth.user.id,
      report_id: report.id,
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
    user_id: auth.user.id,
    actor: "user",
    action_type: "plan",
    provider: "github",
    result: "success",
    target: { repo: targetRepo, report: report.id },
    detail: { started: true },
  });

  return NextResponse.json({ jobId: job.id });
}
