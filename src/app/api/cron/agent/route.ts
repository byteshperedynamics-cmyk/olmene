import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { requireCron } from "@/lib/agent/cron";
import { ACTIVE, driveJob, makePorts } from "@/lib/agent/drive";
import { recordOpsEvent } from "@/lib/agent/ops";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/cron/agent/ — drives fix runs on the server (pg_cron, every 20 s,
 * with the shared cron secret). Every active run whose lease has expired gets
 * advanced until it needs a human (awaiting approval), finishes, or the time
 * budget runs out; the next tick continues. Runs no longer need an open tab.
 */
export async function POST(req: Request) {
  const db = getServiceDb();
  const denied = await requireCron(req, db);
  if (denied) return denied;
  if (!agentEnabled()) return NextResponse.json({ ok: true, skipped: "agent disabled" });

  const now = new Date().toISOString();
  const { data: jobs, error } = await db
    .from("agent_jobs")
    .select("id, user_id, status")
    .in("status", ACTIVE)
    .or(`locked_until.is.null,locked_until.lt.${now}`)
    .order("created_at", { ascending: true })
    .limit(5);
  if (error) return NextResponse.json({ error: { code: "query_failed" } }, { status: 500 });

  const ports = makePorts(db);
  const started = Date.now();
  const results: Array<{ id: string; status: string | null }> = [];
  for (const job of jobs ?? []) {
    const left = 45_000 - (Date.now() - started);
    if (left < 5_000) break;
    try {
      const status = await driveJob(job.id, job.user_id, ports, Math.min(left, 30_000));
      results.push({ id: job.id, status });
    } catch (e) {
      const detail = (e instanceof Error ? e.message : String(e)).slice(0, 200);
      await recordOpsEvent(db, "agent-cron", "fix run could not advance", { jobId: job.id, detail });
      results.push({ id: job.id, status: "error" });
    }
  }
  return NextResponse.json({ ok: true, driven: results });
}
