import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR, requireUser } from "@/lib/agent/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/jobs/[id] — full job state for the driver page:
 * job row (sanitized), planned actions with previews, audit feed.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const db = getServiceDb();
  const { data: job } = await db
    .from("agent_jobs")
    .select("id, user_id, status, current_step, input, step_outputs, error, wait_reason, attempts, created_at, completed_at, report_id, pr_number, pr_url, pr_state, merged_at")
    .eq("id", id)
    .maybeSingle();
  if (!job || job.user_id !== auth.user.id) return ERR.notFound("job");

  const [{ data: actions }, { data: audit }] = await Promise.all([
    db
      .from("planned_actions")
      .select("id, fixer_id, finding_ref, status, skip_reason, target, preview, apply_result, created_at, updated_at")
      .eq("agent_job_id", id)
      .order("created_at", { ascending: true }),
    db
      .from("agent_actions")
      .select("id, actor, action_type, result, target, detail, created_at")
      .eq("agent_job_id", id)
      .order("created_at", { ascending: true })
      .limit(200),
  ]);

  // Strip LLM copy drafts from step outputs (never leave the server).
  const so = (job.step_outputs ?? {}) as Record<string, unknown>;
  if (so.plan && typeof so.plan === "object") {
    const { copy, ...rest } = so.plan as Record<string, unknown>;
    job.step_outputs = { ...so, plan: { ...rest, copyKeys: copy ? Object.keys(copy as object) : [] } };
  }

  return NextResponse.json({ job, actions: actions ?? [], audit: audit ?? [] });
}
