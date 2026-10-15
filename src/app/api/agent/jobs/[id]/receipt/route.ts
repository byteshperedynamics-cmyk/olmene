import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR } from "@/lib/agent/http";
import type { LiveCheckState } from "@/lib/agent/live-check";
import { requireActor } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/jobs/[id]/receipt — the markdown receipt (undo steps,
 * revocation instructions). Only for the job owner.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!agentEnabled()) return ERR.disabled();
  const r = await requireActor(req, "viewer");
  if ("error" in r) return r.error;
  const { actor } = r;
  const { id } = await ctx.params;

  const db = getServiceDb();
  const { data: job } = await db.from("agent_jobs").select("id, user_id, pr_state, merged_at, step_outputs").eq("id", id).maybeSingle();
  if (!job || job.user_id !== actor.ownerId) return ERR.notFound("job");

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
  // The stored receipt is written when the PR opens; what happened after the
  // merge (live re-checks) is appended at read time so it is always current.
  const live = (job.step_outputs as { liveCheck?: LiveCheckState } | null)?.liveCheck;
  let content = receipt.content as string;
  if (job.pr_state === "merged") {
    const lines = ["", "## After the merge", ""];
    if (job.merged_at) lines.push(`- **Merged:** ${String(job.merged_at).replace("T", " ").slice(0, 16)} UTC`);
    if (!live?.last) {
      lines.push("- **Live check:** pending — Olmene checks your public site 10–20 minutes after the merge.");
    } else if (live.last.fetchError) {
      lines.push(`- **Live check:** your site could not be reached (${live.last.fetchError}); Olmene will retry.`);
    } else {
      lines.push(
        `- **Live check (${live.last.checkedAt.replace("T", " ").slice(0, 16)} UTC):** ${live.last.passed} of ${live.last.total} merged fixes are live on ${live.last.siteUrl}`,
      );
      for (const r of live.last.results) lines.push(`  - ${r.ok ? "Live" : "Not live yet"} — ${r.label}: ${r.detail}`);
      if (live.last.regressed.length) lines.push(`- **Regressed since the previous check:** ${live.last.regressed.join(", ")}`);
    }
    content += lines.join("\n") + "\n";
  } else if (job.pr_state === "closed") {
    content += "\n## After review\n\n- The pull request was closed without merging; nothing changed on your site.\n";
  }
  return NextResponse.json({ content, createdAt: receipt.created_at });
}
