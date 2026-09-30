import { NextResponse } from "next/server";
import { getServiceDb, } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR, requireUser } from "@/lib/agent/http";
import { checkApplyEntitlement } from "@/lib/agent/entitlement";
import { writeAudit } from "@/lib/agent/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/jobs/[id]/approve  { actionIds: string[] | "all", note? }
 * The human gate. Flips the job into `applying` — but ONLY for paid users
 * with quota left (free users can plan + preview but not apply).
 * Rejection of the remaining actions is implied when a subset is approved:
 * anything not approved stays `planned` and the apply step ignores it.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  let body: { actionIds?: string[] | "all"; note?: string };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest("Invalid JSON body.");
  }
  const { actionIds, note } = body;

  const db = getServiceDb();
  const { data: job } = await db.from("agent_jobs").select("id, user_id, status, provider").eq("id", id).maybeSingle();
  if (!job || job.user_id !== auth.user.id) return ERR.notFound("job");
  if (job.status !== "awaiting_approval") {
    return ERR.badRequest(`Job is ${job.status} — only jobs awaiting approval can be approved.`);
  }

  const { data: actions } = await db
    .from("planned_actions")
    .select("id, fixer_id, status, preview")
    .eq("agent_job_id", id);
  const planable = (actions ?? []).filter((a: { status: string; preview: unknown }) => a.status === "planned" && a.preview);
  if (planable.length === 0) return ERR.badRequest("Nothing is waiting for approval.");

  const selected =
    actionIds === "all" || !Array.isArray(actionIds)
      ? planable
      : planable.filter((a: { id: string }) => actionIds.includes(a.id));
  if (selected.length === 0) return ERR.badRequest("No valid actions selected.");
  const rejected = planable.filter((a: { id: string }) => !selected.some((s: { id: string }) => s.id === a.id));

  // Entitlement + quota (1 PR = 1 action; charged when the apply succeeds)
  const entitlement = await checkApplyEntitlement(db, auth.user.id);
  if (!entitlement.allowed) {
    await writeAudit(db, {
      agent_job_id: id,
      user_id: auth.user.id,
      actor: "user",
      action_type: "quota_block",
      provider: job.provider,
      result: "blocked",
      detail: { code: entitlement.code, used: entitlement.used, limit: entitlement.limit },
    });
    return NextResponse.json(
      { error: { code: entitlement.code ?? "plan_required", message: entitlement.message ?? "A subscription is required to apply fixes." } },
      { status: 402 },
    );
  }

  const now = new Date().toISOString();
  for (const a of selected as Array<{ id: string; fixer_id: string }>) {
    await db.from("planned_actions").update({ status: "approved", updated_at: now }).eq("id", a.id);
  }
  for (const a of rejected as Array<{ id: string; fixer_id: string }>) {
    await db.from("planned_actions").update({ status: "rejected", updated_at: now }).eq("id", a.id);
  }
  await db.from("approvals").insert({
    agent_job_id: id,
    planned_action_ids: (selected as Array<{ id: string }>).map((a) => a.id),
    decision: "approved",
    decided_by: auth.user.id,
    note: note ?? null,
  });
  if (rejected.length > 0) {
    await db.from("approvals").insert({
      agent_job_id: id,
      planned_action_ids: (rejected as Array<{ id: string }>).map((a) => a.id),
      decision: "rejected",
      decided_by: auth.user.id,
      note: "not selected for approval",
    });
  }
  await writeAudit(db, {
    agent_job_id: id,
    user_id: auth.user.id,
    actor: "user",
    action_type: "approve",
    provider: job.provider,
    result: "success",
    detail: {
      approved: (selected as Array<{ fixer_id: string }>).map((a) => a.fixer_id),
      rejected: (rejected as Array<{ fixer_id: string }>).map((a) => a.fixer_id),
      quotaAfter: { used: entitlement.used, limit: entitlement.limit },
    },
  });

  await db.from("agent_jobs").update({ status: "applying", current_step: "apply", updated_at: now }).eq("id", id);
  return NextResponse.json({ ok: true, approved: selected.length, rejected: rejected.length });
}
