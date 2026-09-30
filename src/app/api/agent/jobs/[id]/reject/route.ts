import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR, requireUser } from "@/lib/agent/http";
import { writeAudit } from "@/lib/agent/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/jobs/[id]/reject  { actionIds?: string[] | "all", note? }
 * Rejects planned actions (all by default). If nothing planned remains, the
 * job completes without touching the repository at all.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  let body: { actionIds?: string[] | "all"; note?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* default: reject all */
  }

  const db = getServiceDb();
  const { data: job } = await db.from("agent_jobs").select("id, user_id, status, provider").eq("id", id).maybeSingle();
  if (!job || job.user_id !== auth.user.id) return ERR.notFound("job");
  if (job.status !== "awaiting_approval") {
    return ERR.badRequest(`Job is ${job.status} — only jobs awaiting approval can be rejected.`);
  }

  const { data: actions } = await db
    .from("planned_actions")
    .select("id, fixer_id, status")
    .eq("agent_job_id", id);
  const planable = (actions ?? []).filter((a: { status: string }) => a.status === "planned");
  const selected =
    body.actionIds && Array.isArray(body.actionIds)
      ? planable.filter((a: { id: string }) => (body.actionIds as string[]).includes(a.id))
      : planable;
  if (selected.length === 0) return ERR.badRequest("Nothing to reject.");

  const now = new Date().toISOString();
  for (const a of selected as Array<{ id: string }>) {
    await db.from("planned_actions").update({ status: "rejected", updated_at: now }).eq("id", a.id);
  }
  await db.from("approvals").insert({
    agent_job_id: id,
    planned_action_ids: (selected as Array<{ id: string }>).map((a) => a.id),
    decision: "rejected",
    decided_by: auth.user.id,
    note: body.note ?? null,
  });
  await writeAudit(db, {
    agent_job_id: id,
    user_id: auth.user.id,
    actor: "user",
    action_type: "reject",
    provider: job.provider,
    result: "success",
    detail: { rejected: (selected as Array<{ fixer_id: string }>).map((a) => a.fixer_id) },
  });

  const remaining = planable.length - selected.length;
  if (remaining === 0) {
    await db
      .from("agent_jobs")
      .update({ status: "completed", current_step: "done", completed_at: now, updated_at: now })
      .eq("id", id);
  }
  return NextResponse.json({ ok: true, rejected: selected.length, remaining });
}
