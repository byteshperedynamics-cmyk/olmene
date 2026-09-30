import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR, requireUser } from "@/lib/agent/http";
import { writeAudit } from "@/lib/agent/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/jobs/[id]/cancel — user cancel before anything is applied.
 * If a PR was already created, cancel is refused (use the PR/receipt instead).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const db = getServiceDb();
  const { data: job } = await db.from("agent_jobs").select("id, user_id, status, provider").eq("id", id).maybeSingle();
  if (!job || job.user_id !== auth.user.id) return ERR.notFound("job");

  if (["applying", "verifying"].includes(job.status)) {
    return ERR.badRequest("Too late to cancel — changes are being written. Review the pull request instead.");
  }
  if (["completed", "failed", "canceled", "killed"].includes(job.status)) {
    return NextResponse.json({ ok: true, status: job.status });
  }

  const now = new Date().toISOString();
  await db.from("agent_jobs").update({ status: "canceled", completed_at: now, updated_at: now }).eq("id", id);
  await writeAudit(db, {
    agent_job_id: id,
    user_id: auth.user.id,
    actor: "user",
    action_type: "cancel",
    provider: job.provider,
    result: "success",
  });
  return NextResponse.json({ ok: true, status: "canceled" });
}
