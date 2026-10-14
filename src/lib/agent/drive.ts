/**
 * Server-side driver for fix runs. A run used to move only while its page was
 * open (the client called /advance in a loop), so closing the tab after
 * "Approve" left the pull request unopened. Now:
 *  - kickAgentJob(): right after a run is created or approved, keep advancing
 *    it after the response (Next's after() → Cloudflare waitUntil, ~30 s);
 *  - /api/cron/agent/ (pg_cron, every 20 s) drives every active run with an
 *    expired lease, so nothing depends on a browser.
 * The runner's atomic lease keeps all drivers exactly-once.
 */
import { after } from "next/server";
import { getServiceDb } from "./db";
import { makeDbPort } from "./db-port";
import { makeGithubPort } from "./github/port";
import { createLlmPort } from "./llm";
import { advanceJob, type JobStatus, type RunnerPorts } from "./runner";
import { recordOpsEvent } from "./ops";

export const ACTIVE = ["queued", "planning", "previewing", "applying", "verifying"];
const STOP: JobStatus[] = ["awaiting_approval", "completed", "failed", "canceled", "killed"];

export function makePorts(db: ReturnType<typeof getServiceDb>): RunnerPorts {
  return { db: makeDbPort(db), gh: makeGithubPort(db), llm: createLlmPort(db) };
}

/** Advance one run until it needs a human, ends, stops moving, or the budget runs out. */
export async function driveJob(jobId: string, userId: string, ports: RunnerPorts, budgetMs: number): Promise<JobStatus | null> {
  const deadline = Date.now() + budgetMs;
  let last: JobStatus | null = null;
  let stalls = 0;
  while (Date.now() < deadline) {
    const before = await ports.db.getJob(jobId);
    if (!before) return null;
    if (STOP.includes(before.status)) return before.status;
    const status = await advanceJob(jobId, ports, userId);
    const afterRow = await ports.db.getJob(jobId);
    // No progress (lease held elsewhere, or a retry backoff): leave it to the next tick.
    if (afterRow && afterRow.status === before.status && afterRow.current_step === before.current_step && afterRow.locked_until) {
      if (++stalls >= 2) return status;
    } else {
      stalls = 0;
    }
    last = status;
    if (STOP.includes(status)) return status;
  }
  return last;
}

/** Keep a run moving right after the response (best effort; the cron driver is the guarantee). */
export function kickAgentJob(jobId: string, budgetMs = 25_000): void {
  try {
    after(async () => {
      const db = getServiceDb();
      try {
        const job = await makeDbPort(db).getJob(jobId);
        if (job) await driveJob(jobId, job.user_id, makePorts(db), budgetMs);
      } catch (e) {
        await recordOpsEvent(db, "agent-kick", "post-response advance failed", { jobId, detail: String(e).slice(0, 200) }, "warn");
      }
    });
  } catch {
    /* outside a request scope (tests): the cron driver picks the run up */
  }
}
