import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR, requireUser } from "@/lib/agent/http";
import { makeGithubPort } from "@/lib/agent/github/port";
import { createLlmPort } from "@/lib/agent/llm";
import { advanceJob, type RunnerPorts } from "@/lib/agent/runner";
import { makeDbPort } from "@/lib/agent/db-port";
import { agentLog } from "@/lib/agent/redact";
import { recordOpsEvent } from "@/lib/agent/ops";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/agent/jobs/[id]/advance — one unit of work per call.
 * An open run page still calls this in a loop, but runs no longer depend on
 * it: /api/cron/agent/ and the post-approve kick drive them server-side.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const db = getServiceDb();
  const { data: job } = await db
    .from("agent_jobs")
    .select("id, user_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!job || job.user_id !== auth.user.id) return ERR.notFound("job");
  if (["completed", "failed", "canceled", "killed"].includes(job.status)) {
    return NextResponse.json({ status: job.status, done: true });
  }

  const ports: RunnerPorts = {
    db: makeDbPort(db),
    gh: makeGithubPort(db),
    llm: createLlmPort(db),
  };

  try {
    const status = await advanceJob(id, ports, auth.user.id);
    return NextResponse.json({ status, done: ["completed", "failed", "canceled", "killed"].includes(status) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "advance failed";
    agentLog("error", "advance failed", { jobId: id, detail: msg.slice(0, 200) });
    await recordOpsEvent(db, "agent-advance", "fix job step failed", { jobId: id, detail: msg.slice(0, 200) });
    return NextResponse.json(
      { error: { code: "advance_failed", message: "The step could not run. It will retry automatically." } },
      { status: 500 },
    );
  }
}
