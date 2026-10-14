/**
 * PR merge tracking (brief §6.3). Polls GitHub (GET only, through the same
 * repo-scoped client the runner uses) for open Olmene PRs and records
 * merged / closed outcomes. Called by POST /api/cron/sync/ on a schedule.
 */
import type { AgentJobRow, AuditEntryInput, GithubPort } from "./runner";
import { liveCheckDue, nextLiveCheckState, runLiveCheck, type AppliedFix, type LiveCheckResult, type LiveCheckState } from "./live-check";
import type { ScopedGithubClient } from "./github/client";

export interface SyncDbPort {
  /** Open PRs, least recently polled first. */
  listOpenPrJobs(limit: number): Promise<AgentJobRow[]>;
  updateJob(jobId: string, patch: Partial<AgentJobRow>): Promise<void>;
  audit(entry: AuditEntryInput): Promise<void>;
  /** Fixes the PR applied (preview checks). Optional: without it previews are not checked. */
  getAppliedFixes?(jobId: string): Promise<AppliedFix[]>;
}

/**
 * The fixes checked on the PR's preview deployment, before merge
 * (agent_jobs.step_outputs.previewCheck). available:false means the app
 * can't read deployments (no Deployments permission) — nothing is retried
 * for a day.
 */
export interface PreviewCheck {
  sha: string;
  checkedAt: string;
  available: boolean;
  reason?: string;
  url?: string;
  passed?: number;
  total?: number;
  results?: LiveCheckResult[];
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
  opts: { limit?: number; now?: () => Date; fetchFn?: (input: string, init?: RequestInit) => Promise<Response> } = {},
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
        const preview = db.getAppliedFixes && opts.fetchFn ? await checkPreview(client, job, pr.head.sha, db, opts.fetchFn, now()) : null;
        await db.updateJob(job.id, {
          pr_last_polled_at: polledAt,
          ...(preview ? { step_outputs: { ...job.step_outputs, previewCheck: preview } } : {}),
        });
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

/** A public https URL (preview URLs come from the user's deploy provider via GitHub). */
function publicPreviewUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    if (!u.hostname.includes(".") || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(u.hostname) || /\.(local|internal)$/.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Before merge: find the PR head's preview deployment (as reported to GitHub
 * by Vercel, Netlify, Cloudflare Pages…) and run the live checks against it.
 * Returns null when nothing new needs saving.
 */
export async function checkPreview(
  client: ScopedGithubClient,
  job: AgentJobRow,
  sha: string,
  db: SyncDbPort,
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>,
  now: Date,
): Promise<PreviewCheck | null> {
  const prev = job.step_outputs?.previewCheck as PreviewCheck | undefined;
  const age = prev ? now.getTime() - new Date(prev.checkedAt).getTime() : Infinity;
  if (prev && !prev.available && age < 24 * 3_600_000) return null;
  if (prev && prev.sha === sha && (prev.url || age < 30 * 60_000)) return null; // verified this commit, or looked recently
  const base: PreviewCheck = { sha, checkedAt: now.toISOString(), available: true };
  let url: string | null = null;
  try {
    const deployments = (await client.listDeployments(sha)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3);
    for (const d of deployments) {
      const statuses = await client.listDeploymentStatuses(d.id);
      const ok = statuses.find((st) => st.state === "success" && publicPreviewUrl(st.environment_url ?? st.target_url));
      if (ok) {
        url = publicPreviewUrl(ok.environment_url ?? ok.target_url);
        break;
      }
    }
  } catch (e) {
    const status = (e as { status?: number }).status;
    return { ...base, available: false, reason: status === 403 || status === 404 ? "The Olmene GitHub app can't read deployments (Deployments: read permission)." : "Deployments could not be read." };
  }
  if (!url) return { ...base, reason: "No successful preview deployment for this commit yet." };
  const fixes = await db.getAppliedFixes!(job.id);
  if (!fixes.length) return { ...base, url, reason: "No applied fixes to check." };
  const run = await runLiveCheck(url, fixes, fetchFn, now);
  if (run.fetchError) return { ...base, url, reason: `The preview could not be loaded (${run.fetchError}).` };
  return { ...base, url, passed: run.passed, total: run.total, results: run.results };
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
