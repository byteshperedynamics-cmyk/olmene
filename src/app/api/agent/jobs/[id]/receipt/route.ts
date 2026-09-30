import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR, requireUser } from "@/lib/agent/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/jobs/[id]/receipt — the markdown receipt (undo steps,
 * revocation instructions). Only for the job owner.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const db = getServiceDb();
  const { data: job } = await db.from("agent_jobs").select("id, user_id").eq("id", id).maybeSingle();
  if (!job || job.user_id !== auth.user.id) return ERR.notFound("job");

  const { data: receipt } = await db
    .from("receipts")
    .select("content, created_at")
    .eq("agent_job_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!receipt) {
    return ERR.notFound("receipt (it is generated after the verify step)");
  }
  return NextResponse.json({ content: receipt.content, createdAt: receipt.created_at });
}
