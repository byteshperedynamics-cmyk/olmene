/**
 * PR merge tracking (brief §6.3). Polls GitHub (GET only, through the same
 * repo-scoped client the runner uses) for open Olmene PRs and records
 * merged / closed outcomes. Called by POST /api/cron/sync/ on a schedule.
 */
import type { AgentJobRow, AuditEntryInput, GithubPort } from "./runner";

export interface SyncDbPort {
  /** Open PRs, least recently polled first. */
  listOpenPrJobs(limit: number): Promise<AgentJobRow[]>;
  updateJob(jobId: string, patch: Partial<AgentJobRow>): Promise<void>;
  audit(entry: AuditEntryInput): Promise<void>;
}

export interface SyncResult {
  checked: number;
  merged: number;
  closed: number;
  errors: number;
}

export async function syncPullStates(
  db: SyncDbPort,
  gh: GithubPort,
  opts: { limit?: number; now?: () => Date } = {},
): Promise<SyncResult> {
  const now = opts.now ?? (() => new Date());
  const jobs = await db.listOpenPrJobs(opts.limit ?? 20);
  const out: SyncResult = { checked: 0, merged: 0, closed: 0, errors: 0 };
  for (const job of jobs) {
    if (!job.pr_number) continue;
    out.checked++;
    try {
      const client = await gh.client(job);
      const pr = await client.getPull(job.pr_number);
      const polledAt = now().toISOString();
      if (pr.merged_at) {
        await db.updateJob(job.id, { pr_state: "merged", merged_at: pr.merged_at, pr_last_polled_at: polledAt });
        await db.audit({
          agent_job_id: job.id,
          user_id: job.user_id,
          actor: "system",
          action_type: "pr_merged",
          provider: job.provider,
          result: "success",
          target: { pr: job.pr_number },
          detail: { mergedAt: pr.merged_at },
        });
        out.merged++;
      } else if (pr.state === "closed") {
        await db.updateJob(job.id, { pr_state: "closed", pr_last_polled_at: polledAt });
        await db.audit({
          agent_job_id: job.id,
          user_id: job.user_id,
          actor: "system",
          action_type: "pr_closed",
          provider: job.provider,
          result: "success",
          target: { pr: job.pr_number },
        });
        out.closed++;
      } else {
        await db.updateJob(job.id, { pr_last_polled_at: polledAt });
      }
    } catch {
      // A revoked connection or deleted repo must not block the others;
      // bump the poll time so the same job is not retried first every run.
      out.errors++;
      await db.updateJob(job.id, { pr_last_polled_at: now().toISOString() });
    }
  }
  return out;
}

/** Constant-time string comparison for the cron secret. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
