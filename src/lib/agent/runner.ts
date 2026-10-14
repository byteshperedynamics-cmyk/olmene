/**
 * Agent Runner — the Plan → Preview → Approval → Apply → Verify → Receipt
 * state machine. One call to advanceJob() performs exactly ONE unit of work
 * under a lease (same chunked pattern as the analysis pipeline; the client
 * drives progress, no long-running worker needed).
 *
 * Ports are injected, so the entire flow is unit-testable with a fake GitHub
 * and an in-memory DB (see __tests__/runner.e2e.test.ts). Production wiring
 * lives in the API routes.
 */

import { isAllowedEditPath, validatePlannedAction, type PlanCheck, type RepoAllowlist } from "./allowlist";
import { writeAudit } from "./audit";
import { sha256Hex } from "./db";
import { unifiedDiff } from "./diff";
import { FIXERS, FIXER_IDS, FIXER_ORDER, remainingChecks, type CopyDrafts, type FileEdit, type FixerContext, type FrameworkTarget } from "./fixers";
import type { ScopedGithubClient } from "./github/client";
import { decodeContent } from "./github/client";
import { detectTarget, normalizeSiteUrl } from "./htmlfile";
import type { ReportData } from "@/lib/report-types";

export type JobStatus =
  | "queued"
  | "planning"
  | "previewing"
  | "awaiting_approval"
  | "applying"
  | "verifying"
  | "completed"
  | "failed"
  | "canceled"
  | "killed";

export interface AgentJobRow {
  id: string;
  user_id: string;
  report_id: string | null;
  /** Free preview runs plan from a saved scan (migration 20261017) instead of a report. */
  scan_id?: string | null;
  connection_id: string | null;
  provider: string;
  status: JobStatus;
  current_step: string | null;
  input: Record<string, unknown>;
  step_outputs: Record<string, unknown>;
  error: string | null;
  wait_reason: string | null;
  locked_until: string | null;
  attempts: number;
  completed_at?: string | null;
  /** PR tracking (migration 20261002_pr_tracking) — set when the PR opens. */
  pr_number?: number | null;
  pr_url?: string | null;
  pr_state?: "open" | "merged" | "closed" | null;
  merged_at?: string | null;
  pr_last_polled_at?: string | null;
}

export interface PlannedActionRow {
  id: string;
  agent_job_id: string;
  fixer_id: string;
  finding_ref: Record<string, unknown>;
  action_class: string;
  target: Record<string, unknown>;
  preview: Record<string, unknown> | null;
  status: string;
  skip_reason: string | null;
  apply_result: Record<string, unknown> | null;
}

// ── Ports ──────────────────────────────────────────────────────────────────

export interface AuditEntryInput {
  agent_job_id?: string | null;
  planned_action_id?: string | null;
  user_id: string;
  actor: "agent" | "user" | "system";
  action_type: string;
  provider?: string | null;
  target?: Record<string, unknown> | null;
  result: "success" | "failure" | "blocked" | "skipped";
  before_hash?: string | null;
  after_hash?: string | null;
  detail?: Record<string, unknown> | null;
}

export interface AgentDbPort {
  getJob(jobId: string): Promise<AgentJobRow | null>;
  /**
   * Atomically take the job's lease: true only if no unexpired lease is held.
   * Optional so in-memory test ports keep working; without it the runner
   * falls back to a read-then-write lease.
   */
  claimJob?(jobId: string, leaseUntil: string, now: string, attempts: number): Promise<boolean>;
  updateJob(jobId: string, patch: Partial<AgentJobRow>): Promise<void>;
  insertPlannedActions(jobId: string, rows: Array<Omit<PlannedActionRow, "id" | "agent_job_id">>): Promise<void>;
  getPlannedActions(jobId: string): Promise<PlannedActionRow[]>;
  updatePlannedAction(id: string, patch: Partial<PlannedActionRow>): Promise<void>;
  insertApproval(
    jobId: string,
    actionIds: string[],
    decision: "approved" | "rejected",
    userId: string,
    note?: string,
  ): Promise<void>;
  audit(entry: AuditEntryInput): Promise<void>;
  getReport(reportId: string): Promise<ReportData | null>;
  /** The report a job plans from: its report, or a lite report built from its saved scan. */
  getReportForJob?(job: AgentJobRow): Promise<ReportData | null>;
  /** Queue a customer notification (outbox; sent by the notify function). */
  notify?(userId: string, kind: string, payload: Record<string, unknown>, dedupeKey: string): Promise<void>;
  getFlags(): Promise<{ globalKillSwitch: boolean; providerGithubEnabled: boolean }>;
  insertReceipt(jobId: string, userId: string, content: string): Promise<void>;
}

export interface GithubPort {
  /** Scoped client for the job's target repo (token never exposed). */
  client(job: AgentJobRow): Promise<ScopedGithubClient>;
}

export interface LlmPort {
  draftCopy(systemPrompt: string, userPrompt: string, maxTokens: number): Promise<unknown>;
}

export interface RunnerPorts {
  db: AgentDbPort;
  gh: GithubPort;
  llm: LlmPort;
  now?: () => Date;
}

export class RunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunnerError";
  }
}

const LEASE_MS = 90_000;
const TERMINAL: JobStatus[] = ["completed", "failed", "canceled", "killed"];

function userSafe(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/gh[a-z]_[A-Za-z0-9_]+/g, "[REDACTED]").slice(0, 300);
}

/** Validate EVERY file an action writes (not just the first) against the plan policy. */
function validateAllFiles(
  action: { fixer_id: string; action_class: string },
  files: string[],
  allow: RepoAllowlist,
  defaultBranch: string,
  target: Record<string, string>,
): PlanCheck {
  if (files.length === 0) return { ok: false, reason: "action has no files" };
  for (const path of files) {
    const check = validatePlannedAction(
      { fixer_id: action.fixer_id, action_class: action.action_class, target: { ...target, path } },
      allow,
      FIXER_IDS,
      defaultBranch,
    );
    if (!check.ok) return check;
  }
  return { ok: true };
}

/** Build the fixer context from the repo state. */
async function buildFixerContext(
  gh: ScopedGithubClient,
  report: ReportData,
  copy: CopyDrafts,
): Promise<{ ctx: FixerContext; defaultBranch: string; headSha: string }> {
  const repo = await gh.getRepo();
  const allow = gh.allow as RepoAllowlist;
  if (repo.full_name !== `${allow.owner}/${allow.repo}`) {
    throw new RunnerError(`repo mismatch: token scoped to ${repo.full_name}`);
  }
  const defaultBranch = repo.default_branch || "main";
  const branch = await gh.getBranch(defaultBranch);
  const tree = await gh.getTree(branch.commit.sha, true);
  const paths = tree.tree.filter((t) => t.type === "blob").map((t) => t.path);
  const detection = detectTarget(paths);
  let homepageHtml: string | null = null;
  if (detection.homepagePath) {
    const content = await gh.getContent(detection.homepagePath, defaultBranch);
    homepageHtml = content ? decodeContent(content) : null;
  }
  const read = async (p: string) => {
    const c = await gh.getContent(p, defaultBranch);
    return c ? decodeContent(c) : null;
  };
  let framework: FrameworkTarget | null = null;
  if (detection.repoType === "nextjs-app" && detection.nextLayoutPath) {
    const layout = await read(detection.nextLayoutPath);
    if (layout !== null) framework = { kind: "nextjs-app", headPath: detection.nextLayoutPath, headContent: layout };
  } else if (detection.repoType === "astro" && detection.astroIndexPath) {
    const index = await read(detection.astroIndexPath);
    if (index !== null) {
      // The homepage's layout owns <head> when index.astro imports one from
      // src/layouts/ — relative ("../layouts/X.astro") or via the usual path
      // aliases ("@/layouts/", "~/layouts/", "@layouts/"; astro-paper,
      // astrowind). One nested hop: a page layout wrapping a base layout.
      const layoutImport = (src: string) =>
        src.match(/import\s+\w+\s+from\s+["'](?:\.{1,2}\/(?:\.\.\/)*|@\/|~\/|@|\/src\/)?layouts\/([A-Za-z0-9_-]+\.astro)["']/)?.[1] ?? null;
      let layoutPath: string | null = null;
      let layout: string | null = null;
      let next = layoutImport(index);
      for (let hop = 0; next && hop < 2; hop++) {
        const candidate = `src/layouts/${next}`;
        if (!paths.includes(candidate)) break;
        const content = await read(candidate);
        if (content === null) break;
        layoutPath = candidate;
        layout = content;
        if (/<head[\s>]/i.test(content)) break;
        next = layoutImport(content);
      }
      if (layout !== null && layoutPath && /<head[\s>]/i.test(layout)) {
        framework = { kind: "astro", headPath: layoutPath, headContent: layout, pagePath: detection.astroIndexPath, pageContent: index };
      } else if (/<head[\s>]/i.test(index)) {
        framework = { kind: "astro", headPath: detection.astroIndexPath, headContent: index, pagePath: detection.astroIndexPath, pageContent: index };
      }
    }
  }
  if (detection.repoType === "nextjs-pages" && detection.pagesIndexPath) {
    const index = await read(detection.pagesIndexPath);
    const doc = detection.pagesDocumentPath ? await read(detection.pagesDocumentPath) : null;
    if (index !== null) {
      framework = doc !== null && detection.pagesDocumentPath
        ? { kind: "nextjs-pages", headPath: detection.pagesDocumentPath, headContent: doc, pagePath: detection.pagesIndexPath, pageContent: index }
        : { kind: "nextjs-pages", headPath: detection.pagesIndexPath, headContent: index, pagePath: detection.pagesIndexPath, pageContent: index };
    }
  } else if (detection.repoType === "nuxt" && detection.nuxtConfigPath) {
    const config = await read(detection.nuxtConfigPath);
    if (config !== null) framework = { kind: "nuxt", headPath: detection.nuxtConfigPath, headContent: config };
  }
  // SvelteKit pages set head tags in <svelte:head>; app.html must not duplicate them.
  let managed: Array<"title" | "description" | "og" | "jsonld"> | undefined;
  if (detection.spaKind === "sveltekit") {
    const heads = (await Promise.all(["src/routes/+layout.svelte", "src/routes/+page.svelte"].filter((p) => paths.includes(p)).map(read)))
      .map((src) => src?.match(/<svelte:head>([\s\S]*?)<\/svelte:head>/)?.[1] ?? "")
      .join("\n");
    managed = [
      ...(/<title>/.test(heads) ? ["title" as const] : []),
      ...(/name=["']description["']/.test(heads) ? ["description" as const] : []),
      ...(/property=["']og:/.test(heads) ? ["og" as const] : []),
      ...(/application\/ld\+json/.test(heads) ? ["jsonld" as const] : []),
    ];
  }
  const packageJson = paths.includes("package.json") ? await read("package.json") : null;
  return {
    ctx: {
      report,
      packageJson,
      siteUrl: normalizeSiteUrl(report.meta.siteUrl),
      homepagePath: detection.homepagePath,
      homepageHtml,
      treePaths: paths,
      repo: { owner: allow.owner, name: allow.repo, defaultBranch },
      copy,
      framework,
      spa: detection.repoType === "spa" && detection.spaKind ? { kind: detection.spaKind, ...(managed ? { managed } : {}) } : null,
    },
    defaultBranch,
    headSha: branch.commit.sha,
  };
}

/** One unit of work. Returns the (possibly new) status. */
export async function advanceJob(jobId: string, ports: RunnerPorts, actorUserId: string): Promise<JobStatus> {
  const { db, gh, llm } = ports;
  const now = ports.now ?? (() => new Date());

  const job = await db.getJob(jobId);
  if (!job) throw new RunnerError("job not found");

  if (TERMINAL.includes(job.status) || job.status === "awaiting_approval") return job.status;

  // Lease: skip if another advance is mid-flight. Claimed atomically when the
  // port supports it (the tab, the cron driver and the approve kick can all
  // call at once).
  const leaseUntil = new Date(now().getTime() + LEASE_MS).toISOString();
  if (db.claimJob) {
    if (!(await db.claimJob(jobId, leaseUntil, now().toISOString(), job.attempts + 1))) return job.status;
  } else {
    const lockedUntil = job.locked_until ? new Date(job.locked_until).getTime() : 0;
    if (lockedUntil > now().getTime()) return job.status;
    await db.updateJob(jobId, { locked_until: leaseUntil, attempts: job.attempts + 1 });
  }

  try {
    if (job.status === "queued" || job.status === "planning") {
      await runPlanning(job, ports);
    } else if (job.status === "previewing") {
      await runPreview(job, ports);
    } else if (job.status === "applying") {
      await runApply(job, ports);
    } else if (job.status === "verifying") {
      await runVerify(job, ports);
    }
    const updated = await db.getJob(jobId);
    return updated?.status ?? job.status;
  } catch (err) {
    const attempts = job.attempts + 1;
    if (attempts >= 3) {
      await db.updateJob(jobId, {
        status: "failed",
        error: userSafe(err),
        locked_until: null,
        completed_at: now().toISOString(),
      });
      await db.audit({
        agent_job_id: jobId,
        user_id: job.user_id,
        actor: "agent",
        action_type: job.current_step ?? "advance",
        provider: job.provider,
        result: "failure",
        detail: { error: userSafe(err), attempts },
      });
    } else {
      await db.updateJob(jobId, {
        error: userSafe(err),
        locked_until: new Date(now().getTime() + 30_000).toISOString(),
      });
    }
    const updated = await db.getJob(jobId);
    return updated?.status ?? "failed";
  } finally {
    // Release the lease for every non-terminal state — including
    // awaiting_approval (the next advance re-acquires it; the approval wait
    // is a human pause, not a concurrent-work guard).
    const fresh = await db.getJob(jobId);
    if (fresh && !TERMINAL.includes(fresh.status)) {
      await db.updateJob(jobId, { locked_until: null });
    }
  }
}

// ── Steps ──────────────────────────────────────────────────────────────────

/** The report this job plans from (a full report, or a lite one from a saved scan). */
function loadReport(db: AgentDbPort, job: AgentJobRow): Promise<ReportData | null> {
  return db.getReportForJob ? db.getReportForJob(job) : db.getReport(job.report_id ?? "");
}

async function runPlanning(job: AgentJobRow, ports: RunnerPorts): Promise<void> {
  const { db, llm } = ports;
  await db.updateJob(job.id, { status: "planning", current_step: "plan" });

  const report = await loadReport(db, job);
  if (!report) throw new RunnerError("report not found");

  const { buildPlan } = await import("./planner");
  const plan = await buildPlan(report, llm);

  const input = job.input as { targetRepo?: string };
  const [owner, repo] = (input.targetRepo ?? "").split("/");

  const rows = plan.candidates.map((c) => ({
    fixer_id: c.fixerId,
    finding_ref: c.findingRef,
    action_class: "reversible_write",
    target: { owner, repo, branch: `olmene/fix-${job.id.slice(0, 8)}-a1` },
    preview: null,
    status: "planned",
    skip_reason: null,
    apply_result: null,
  }));
  if (rows.length > 0) await db.insertPlannedActions(job.id, rows);

  await db.updateJob(job.id, {
    status: "previewing",
    current_step: "preview",
    step_outputs: {
      ...job.step_outputs,
      plan: {
        candidates: plan.candidates.map((c) => ({ fixerId: c.fixerId, title: c.title })),
        copy: plan.copy, // server-side only; never sent raw to the client
        llmStatus: plan.llmStatus,
        notes: plan.notes,
        generatedAt: new Date().toISOString(),
      },
    },
  });
  await db.audit({
    agent_job_id: job.id,
    user_id: job.user_id,
    actor: "agent",
    action_type: "plan",
    provider: job.provider,
    result: "success",
    target: { repo: input.targetRepo },
    detail: { candidates: plan.candidates.map((c) => c.fixerId), llmStatus: plan.llmStatus, notes: plan.notes },
  });
}

async function runPreview(job: AgentJobRow, ports: RunnerPorts): Promise<void> {
  const { db, gh } = ports;
  await db.updateJob(job.id, { current_step: "preview" });

  const report = await loadReport(db, job);
  if (!report) throw new RunnerError("report not found");
  const client = await gh.client(job);

  const actions = await db.getPlannedActions(job.id);
  const planned = actions.filter((a) => a.status === "planned");
  if (planned.length === 0) {
    await db.updateJob(job.id, {
      status: "completed",
      current_step: "done",
      error: null,
      completed_at: new Date().toISOString(),
      step_outputs: { ...job.step_outputs, preview: { skippedAll: true, reason: "no triggered fixers" } },
    });
    return;
  }

  const planOut = job.step_outputs.plan as { copy?: CopyDrafts } | undefined;
  const { ctx, defaultBranch, headSha } = await buildFixerContext(client, report, planOut?.copy ?? {});

  const previewOut: Record<string, unknown> = {
    detectedHomepage: ctx.homepagePath,
    defaultBranch,
    headSha: headSha.slice(0, 10),
    repoType: ctx.framework?.kind ?? (ctx.homepagePath ? "static-html" : "unsupported"),
  };
  let viable = 0;
  for (const action of planned) {
    const fixer = FIXERS.find((f) => f.id === action.fixer_id);
    if (!fixer) {
      await db.updatePlannedAction(action.id, { status: "skipped", skip_reason: `unknown fixer ${action.fixer_id}` });
      continue;
    }
    const outcome = fixer.build(ctx);
    if ("skip" in outcome) {
      await db.updatePlannedAction(action.id, { status: "skipped", skip_reason: outcome.skip });
      await db.audit({
        agent_job_id: job.id,
        planned_action_id: action.id,
        user_id: job.user_id,
        actor: "agent",
        action_type: "preview",
        provider: job.provider,
        result: "skipped",
        target: { fixer: action.fixer_id },
        detail: { reason: outcome.skip },
      });
      continue;
    }
    const files = outcome.edits.map((e) => e.path);
    const preview = {
      files,
      edits: outcome.edits.map((e) => ({
        path: e.path,
        isNewFile: e.before === null,
        diff: unifiedDiff(e.path, e.before ?? "", e.after),
      })),
      explanation: outcome.explanation,
      evidence: outcome.evidence,
      expectedScoreChange: outcome.expectedScoreChange,
      revertSteps: outcome.revertSteps,
    };
    // Plan-level allowlist validation BEFORE the action can ever be approved —
    // every file the action writes, not just the first.
    const allow: RepoAllowlist = { owner: ctx.repo.owner, repo: ctx.repo.name };
    const check = validateAllFiles(action, files, allow, defaultBranch, action.target as Record<string, string>);
    if (!check.ok) {
      await db.updatePlannedAction(action.id, { status: "skipped", skip_reason: `blocked by validator: ${check.reason}` });
      await db.audit({
        agent_job_id: job.id,
        planned_action_id: action.id,
        user_id: job.user_id,
        actor: "agent",
        action_type: "preview",
        provider: job.provider,
        result: "blocked",
        target: { fixer: action.fixer_id },
        detail: { reason: check.reason },
      });
      continue;
    }
    await db.updatePlannedAction(action.id, {
      preview,
      target: { ...(action.target as Record<string, unknown>), owner: ctx.repo.owner, repo: ctx.repo.name, files },
      status: "planned",
    });
    previewOut[action.fixer_id] = { files };
    viable++;
  }

  if (viable === 0) {
    await db.updateJob(job.id, {
      status: "completed",
      current_step: "done",
      completed_at: new Date().toISOString(),
      step_outputs: { ...job.step_outputs, preview: previewOut },
    });
    await db.audit({
      agent_job_id: job.id,
      user_id: job.user_id,
      actor: "agent",
      action_type: "preview",
      provider: job.provider,
      result: "skipped",
      detail: { reason: "no viable fixes after preview" },
    });
    return;
  }

  await db.updateJob(job.id, {
    status: "awaiting_approval",
    current_step: "await_approval",
    step_outputs: { ...job.step_outputs, preview: previewOut },
  });
  await db.audit({
    agent_job_id: job.id,
    user_id: job.user_id,
    actor: "agent",
    action_type: "preview",
    provider: job.provider,
    result: "success",
    detail: { viable, skipped: planned.length - viable },
  });
}

/** Fix branches are `olmene/fix-<job>-a<n>`; a new name per attempt, never a moved ref. */
const MAX_FIX_BRANCH_ATTEMPTS = 5;
function fixBranchName(jobId: string, attempt: number): string {
  return `olmene/fix-${jobId.slice(0, 8)}-a${attempt}`;
}

async function runApply(job: AgentJobRow, ports: RunnerPorts): Promise<void> {
  const { db, gh } = ports;
  await db.updateJob(job.id, { current_step: "apply" });

  // Kill switches first — before any write
  const flags = await db.getFlags();
  if (flags.globalKillSwitch || !flags.providerGithubEnabled) {
    await db.updateJob(job.id, { status: "killed", error: "Stopped by operator kill switch before any write." });
    await db.audit({
      agent_job_id: job.id,
      user_id: job.user_id,
      actor: "system",
      action_type: "kill_block",
      provider: job.provider,
      result: "blocked",
    });
    return;
  }

  const actions = await db.getPlannedActions(job.id);
  // "applied" is included for replay idempotency: if a previous apply
  // committed + opened a PR but died before the status flip, the actions are
  // already applied and the findPullForBranch fast-path replays to verifying.
  const approved = actions.filter(
    (a) => (a.status === "approved" || a.status === "applied") && a.preview,
  );
  if (approved.length === 0) {
    await db.updateJob(job.id, {
      status: "completed",
      current_step: "done",
      completed_at: new Date().toISOString(),
      step_outputs: { ...job.step_outputs, apply: { nothingApproved: true } },
    });
    return;
  }

  const report = await loadReport(db, job);
  if (!report) throw new RunnerError("report not found");
  const client = await gh.client(job);
  const input = job.input as { targetRepo?: string };
  const [owner, repoName] = (input.targetRepo ?? "").split("/");
  const allow: RepoAllowlist = { owner, repo: repoName };

  const repoInfo = await client.getRepo();
  const defaultBranch = repoInfo.default_branch || "main";
  const baseBranch = await client.getBranch(defaultBranch);
  const branchName = fixBranchName(job.id, 1);

  // Final allowlist validation of every action (deterministic, code-only)
  for (const action of approved) {
    const target = action.target as Record<string, string>;
    const files = (action.preview as { files?: string[] })?.files ?? [];
    const check = validateAllFiles(action, files, allow, defaultBranch, { ...target, branch: branchName });
    if (!check.ok) {
      throw new RunnerError(`blocked by validator: ${check.reason}`);
    }
  }

  // Idempotency: if this job already opened a PR (on any attempt branch), do not open another.
  let existingPr: Awaited<ReturnType<typeof client.findPullForBranch>> = null;
  let existingPrBranch = branchName;
  for (let attempt = 1; attempt <= MAX_FIX_BRANCH_ATTEMPTS && !existingPr; attempt++) {
    existingPrBranch = fixBranchName(job.id, attempt);
    existingPr = await client.findPullForBranch(`${owner}:${existingPrBranch}`);
  }
  if (existingPr) {
    await db.updateJob(job.id, {
      status: "verifying",
      current_step: "verify",
      pr_number: existingPr.number,
      pr_url: existingPr.html_url,
      pr_state: "open",
      step_outputs: {
        ...job.step_outputs,
        apply: {
          prUrl: existingPr.html_url,
          prNumber: existingPr.number,
          commitSha: existingPr.head.sha,
          branch: existingPrBranch,
          applied: approved.length,
          idempotentReplay: true,
        },
      },
    });
    return;
  }

  // Compose approved fixes SEQUENTIALLY (deterministic order) so that
  // multiple fixers editing the same file stack correctly.
  const planOut = job.step_outputs.plan as { copy?: CopyDrafts } | undefined;
  const { ctx } = await buildFixerContext(client, report, planOut?.copy ?? {});
  const ordered = [...approved].sort(
    (a, b) => (FIXER_ORDER[a.fixer_id] ?? 999) - (FIXER_ORDER[b.fixer_id] ?? 999),
  );
  const currentContent = new Map<string, string>(); // path → content (accumulated)
  const touched = new Set<string>();
  if (ctx.homepagePath && ctx.homepageHtml) currentContent.set(ctx.homepagePath, ctx.homepageHtml);
  if (ctx.framework) {
    currentContent.set(ctx.framework.headPath, ctx.framework.headContent);
    if (ctx.framework.pagePath && ctx.framework.pageContent !== undefined) {
      currentContent.set(ctx.framework.pagePath, ctx.framework.pageContent);
    }
  }

  for (const action of ordered) {
    const fixer = FIXERS.find((f) => f.id === action.fixer_id);
    if (!fixer) continue;
    // Each fixer sees the content as already edited by the fixers before it.
    const fw = ctx.framework;
    const stepCtx: FixerContext = {
      ...ctx,
      homepageHtml: ctx.homepagePath ? currentContent.get(ctx.homepagePath) ?? null : null,
      framework: fw
        ? {
            ...fw,
            headContent: currentContent.get(fw.headPath) ?? fw.headContent,
            pageContent: fw.pagePath ? currentContent.get(fw.pagePath) ?? fw.pageContent : fw.pageContent,
          }
        : null,
      treePaths: [...new Set([...ctx.treePaths, ...touched])],
    };
    const outcome = fixer.build(stepCtx);
    if ("skip" in outcome) continue;
    for (const edit of outcome.edits) {
      currentContent.set(edit.path, edit.after);
      touched.add(edit.path);
    }
  }
  if (touched.size === 0) throw new RunnerError("fixers produced no edits at apply time (report/repo state changed)");
  // Defense in depth: every path about to be written passes the file policy.
  for (const path of touched) {
    if (!isAllowedEditPath(path) || path.includes("..") || path.startsWith("/")) {
      throw new RunnerError(`blocked by validator: file not allowed for fixers: ${path}`);
    }
  }

  // Git write path: tree → commit → branch → PR. Refs are only ever CREATED
  // (the client has no PATCH, by policy), so the commit must exist before the
  // branch does: creating the branch first left it on the base commit and
  // GitHub refused the pull request ("No commits between …").
  const treeItems = [...touched].map((path) => ({
    path,
    mode: "100644" as const,
    type: "blob" as const,
    content: currentContent.get(path) ?? "",
  }));
  // base_tree must be a TREE sha (GitHub docs); the branch payload carries it.
  const baseTreeSha = baseBranch.commit.commit?.tree?.sha ?? baseBranch.commit.sha;
  const tree = await client.createTree(baseTreeSha, treeItems);

  const fixerList = approved.map((a) => a.fixer_id).join(", ");
  const commit = await client.createCommit(
    `Olmene: apply ${approved.length} report-proven fix${approved.length === 1 ? "" : "es"} (${fixerList})`,
    tree.sha,
    [baseBranch.commit.sha],
  );

  // A branch left behind by a partial attempt is reused only when it already
  // holds exactly this tree; otherwise the next free attempt name is used.
  let prBranch = branchName;
  let headSha = commit.sha;
  for (let attempt = 1; ; attempt++) {
    const name = fixBranchName(job.id, attempt);
    const existing = await client.getBranch(name).catch(() => null);
    if (!existing) {
      await client.createRef(`refs/heads/${name}`, commit.sha);
      prBranch = name;
      headSha = commit.sha;
      break;
    }
    if (existing.commit.commit?.tree?.sha === tree.sha) {
      prBranch = name;
      headSha = existing.commit.sha;
      break;
    }
    if (attempt >= MAX_FIX_BRANCH_ATTEMPTS) {
      throw new RunnerError(`no free fix branch name after ${MAX_FIX_BRANCH_ATTEMPTS} attempts`);
    }
  }

  const remaining = remainingChecks(report, actions);
  const prBody = [
    "This PR was generated by [Olmene](https://olmene.com) from your marketing report.",
    "",
    "## Fixes in this PR",
    ...approved.flatMap((a) => {
      const p = a.preview as { explanation?: string; evidence?: string; expectedScoreChange?: string };
      return [
        `### ${a.fixer_id}`,
        p.explanation ?? "",
        "",
        `**Why:** ${p.evidence ?? ""}`,
        `**Expected effect:** ${p.expectedScoreChange ?? ""}`,
        "",
      ];
    }),
    ...(remaining.length
      ? [
          "## Still on your list",
          "The report also flagged these. They are not in this PR — each line says why.",
          "",
          ...remaining.map((r) => `- [ ] **${r.check}** (${r.status}): ${r.note}`),
          "",
        ]
      : []),
    "## How to undo",
    "- Not merged yet? Just close this PR.",
    `- Already merged? Run \`git revert ${headSha.slice(0, 12)}\` or use GitHub's *Revert* button.`,
    "",
    "## Scope guarantees",
    `- Only these files were touched, on branch \`${prBranch}\` only: ${[...touched].join(", ")}.`,
    `- Your default branch (\`${defaultBranch}\`) was never pushed to.`,
    "- The Olmene GitHub App has Contents + Pull requests (write) permission only.",
    "",
    `_agent_job: ${job.id}_`,
  ].join("\n");

  const pr = await client.createPull({
    title: `Olmene: ${approved.length} report-proven fix${approved.length === 1 ? "" : "es"} for ${owner}/${repoName}`,
    body: prBody,
    head: prBranch,
    base: defaultBranch,
  });

  // Record per-action results + audit (before/after content hashes)
  for (const action of approved) {
    const p = action.preview as { files?: string[] };
    const file = p.files?.[0] ?? "";
    const afterContent = currentContent.get(file) ?? "";
    await db.updatePlannedAction(action.id, {
      status: "applied",
      apply_result: { prUrl: pr.html_url, prNumber: pr.number, commitSha: headSha, branch: prBranch },
    });
    await db.audit({
      agent_job_id: job.id,
      planned_action_id: action.id,
      user_id: job.user_id,
      actor: "agent",
      action_type: "apply",
      provider: job.provider,
      target: { repo: `${owner}/${repoName}`, path: file, branch: prBranch },
      result: "success",
      before_hash: ctx.homepagePath === file && ctx.homepageHtml ? await sha256Hex(ctx.homepageHtml) : null,
      after_hash: await sha256Hex(afterContent),
      detail: { fixer: action.fixer_id, pr: pr.number, commit: headSha.slice(0, 12), files: p.files },
    });
  }

  await db.updateJob(job.id, {
    status: "verifying",
    current_step: "verify",
    pr_number: pr.number,
    pr_url: pr.html_url,
    pr_state: "open",
    step_outputs: {
      ...job.step_outputs,
      apply: {
        prUrl: pr.html_url,
        prNumber: pr.number,
        commitSha: headSha,
        branch: prBranch,
        applied: approved.length,
        files: [...touched],
      },
    },
  });
  if (db.notify) {
    await db
      .notify(
        job.user_id,
        "pr_opened",
        { jobId: job.id, repo: `${owner}/${repoName}`, prNumber: pr.number, prUrl: pr.html_url, fixes: approved.length },
        `pr_opened:${job.id}`,
      )
      .catch(() => {});
  }
}

async function runVerify(job: AgentJobRow, ports: RunnerPorts): Promise<void> {
  const { db, gh } = ports;
  await db.updateJob(job.id, { current_step: "verify" });

  const applyOut = job.step_outputs.apply as
    | { prNumber?: number; prUrl?: string; commitSha?: string; branch?: string }
    | undefined;
  if (!applyOut?.prNumber) throw new RunnerError("missing PR reference from apply step");

  const client = await gh.client(job);
  const pr = await client.getPull(applyOut.prNumber);
  const appliedCount = (await db.getPlannedActions(job.id)).filter((a) => a.status === "applied").length;

  const verified =
    pr.state === "open" &&
    pr.head.ref === (applyOut.branch ?? "") &&
    pr.head.sha === (applyOut.commitSha ?? "") &&
    (pr.changed_files ?? 0) > 0;

  await db.audit({
    agent_job_id: job.id,
    user_id: job.user_id,
    actor: "agent",
    action_type: "verify",
    provider: job.provider,
    target: { pr: applyOut.prNumber },
    result: verified ? "success" : "failure",
    detail: {
      state: pr.state,
      head: pr.head.ref,
      sha: pr.head.sha.slice(0, 10),
      changedFiles: pr.changed_files,
      expectedActions: appliedCount,
    },
  });

  const { buildReceipt } = await import("./receipt");
  const actions = await db.getPlannedActions(job.id);
  const receipt = await buildReceipt(job, actions, {
    prUrl: pr.html_url,
    prNumber: pr.number,
    verified,
  });
  await db.insertReceipt(job.id, job.user_id, receipt);

  if (!verified) {
    await db.updateJob(job.id, {
      status: "failed",
      error:
        "Verification failed — the PR state did not match the applied commit. No further writes were made; review the PR manually.",
      completed_at: new Date().toISOString(),
    });
    return;
  }

  await db.updateJob(job.id, {
    status: "completed",
    current_step: "done",
    error: null,
    completed_at: new Date().toISOString(),
    step_outputs: { ...job.step_outputs, verify: { verified: true, prUrl: pr.html_url } },
  });
}

// Re-export for route wiring.
export { writeAudit };
