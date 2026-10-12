/**
 * PR merge tracking (brief §6.3). Polls GitHub (GET only, through the same
 * repo-scoped client the runner uses) for open Olmene PRs and records
 * merged / closed outcomes. Called by POST /api/cron/sync/ on a schedule.
 */
import type { AgentJobRow, AuditEntryInput, GithubPort } from "./runner";
import { liveCheckDue, nextLiveCheckState, runLiveCheck, type AppliedFix, type LiveCheckState } from "./live-check";

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

// ───────────────────────────────────────────────────────────────────────────
// Live re-check of merged fixes ("Verify" — see live-check.ts)
// ───────────────────────────────────────────────────────────────────────────


export interface LiveCheckDbPort {
  /** Merged fix runs, most recently merged first. */
  listMergedJobs(limit: number): Promise<AgentJobRow[]>;
  getAppliedFixes(jobId: string): Promise<AppliedFix[]>;
  /** Public site the report was made for (report meta.siteUrl). */
  getSiteUrl(job: AgentJobRow): Promise<string | null>;
  saveLiveCheck(job: AgentJobRow, state: LiveCheckState): Promise<void>;
  audit(entry: AuditEntryInput): Promise<void>;
  /** Queue a customer email (outbox). Optional so tests and older ports keep working. */
  notify?(userId: string, kind: string, payload: Record<string, unknown>, dedupeKey: string): Promise<void>;
}

export interface LiveSyncResult {
  checked: number;
  allLive: number;
  regressions: number;
  errors: number;
}

export async function syncLiveChecks(
  db: LiveCheckDbPort,
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>,
  opts: { limit?: number; maxChecks?: number; now?: () => Date } = {},
): Promise<LiveSyncResult> {
  const now = opts.now ?? (() => new Date());
  const out: LiveSyncResult = { checked: 0, allLive: 0, regressions: 0, errors: 0 };
  // 200 most recent merges: each needs at most a weekly re-check once settled.
  const jobs = await db.listMergedJobs(opts.limit ?? 200);
  for (const job of jobs) {
    if (out.checked >= (opts.maxChecks ?? 8)) break;
    if (!job.merged_at) continue;
    const prev = (job.step_outputs?.liveCheck as LiveCheckState | undefined) ?? undefined;
    if (!liveCheckDue(job.merged_at, prev, now())) continue;
    out.checked++;
    try {
      const siteUrl = await db.getSiteUrl(job);
      const fixes = await db.getAppliedFixes(job.id);
      if (!siteUrl || fixes.length === 0) continue;
      const run = await runLiveCheck(siteUrl, fixes, fetchFn, now());
      const state = nextLiveCheckState(prev, run, job.merged_at, now());
      await db.saveLiveCheck(job, state);
      const allLive = run.total > 0 && run.passed === run.total;
      if (allLive) out.allLive++;
      if (state.last?.regressed.length) out.regressions++;
      // Tell the customer: the first time every merged fix is live, and when one stops working.
      let site = siteUrl;
      try {
        site = new URL(siteUrl).hostname;
      } catch { /* keep the URL */ }
      const wasAllLive = !!prev?.last && prev.last.total > 0 && prev.last.passed === prev.last.total;
      if (allLive && !wasAllLive && db.notify) {
        await db.notify(job.user_id, "fixes_live", { jobId: job.id, site, passed: run.passed, total: run.total, prNumber: job.pr_number ?? null }, `fixes_live:${job.id}`).catch(() => {});
      }
      if (state.last?.regressed.length && db.notify) {
        const labels = state.last.results.filter((r) => state.last!.regressed.includes(r.fixer)).map((r) => r.label);
        await db.notify(job.user_id, "fix_regression", { jobId: job.id, site, regressed: labels }, `fix_regression:${job.id}:${run.checkedAt.slice(0, 10)}`).catch(() => {});
      }
      await db.audit({
        agent_job_id: job.id,
        user_id: job.user_id,
        actor: "system",
        action_type: "verify_live",
        provider: job.provider,
        result: run.fetchError ? "failure" : allLive ? "success" : "skipped",
        target: { site: siteUrl, pr: job.pr_number ?? null },
        detail: {
          passed: run.passed,
          total: run.total,
          regressed: state.last?.regressed ?? [],
          fetchError: run.fetchError ?? null,
          reason: run.fetchError
            ? `Could not reach the live site (${run.fetchError}).`
            : allLive
              ? "Every merged fix is live."
              : `${run.passed} of ${run.total} merged fixes are live so far.`,
        },
      });
    } catch {
      out.errors++;
    }
  }
  return out;
}
