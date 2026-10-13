"use client";

/**
 * Client API for the agent routes (same-origin, Bearer-authenticated).
 * Everything is typed; the server sanitizes payloads (LLM copy never leaves
 * the server; tokens never exist client-side at all).
 */

import { getSupabase } from "./supabase";

export class AgentApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "AgentApiError";
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabase();
  const session = (await supabase?.auth.getSession())?.data.session;
  const token = session?.access_token ?? "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } })?.error;
    throw new AgentApiError(res.status, err?.code ?? "request_failed", err?.message ?? "Request failed.");
  }
  return data as T;
}

export const featureAgentEnabled = () =>
  (process.env.NEXT_PUBLIC_FEATURE_AGENT ?? "").toLowerCase() === "true" ||
  (process.env.NEXT_PUBLIC_FEATURE_AGENT ?? "") === "1";

// ── Shapes ──────────────────────────────────────────────────────────────────

export interface AgentConnection {
  id: string;
  status: string;
  account: string | null;
  installationId: string | null;
  repos: string[] | null;
  createdAt: string;
  lastVerifiedAt: string | null;
}

export interface AgentEntitlement {
  allowed: boolean;
  code?: string;
  message?: string;
  planName?: string | null;
  limit: number;
  used: number;
  remaining: number;
}

export interface AgentConfig {
  enabled: boolean;
  killSwitch: boolean;
  github: {
    configured: boolean;
    /** True only for the owner while no app is registered. */
    canRegister?: boolean;
    appSlug: string | null;
    connections: AgentConnection[];
  };
  entitlement: AgentEntitlement;
}

export interface PlannedAction {
  id: string;
  fixer_id: string;
  finding_ref: Record<string, unknown>;
  status: "planned" | "skipped" | "approved" | "rejected" | "applied" | "failed" | "rolled_back";
  skip_reason: string | null;
  target: Record<string, unknown>;
  preview: {
    files: string[];
    edits: Array<{ path: string; isNewFile: boolean; diff: string }>;
    explanation: string;
    evidence: string;
    expectedScoreChange: string;
    revertSteps: string[];
  } | null;
  apply_result: { prUrl?: string; prNumber?: number; commitSha?: string; branch?: string } | null;
  created_at: string;
}

export interface AuditRow {
  id: string;
  actor: string;
  action_type: string;
  result: string;
  target: Record<string, unknown> | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface AgentJob {
  id: string;
  status: string;
  current_step: string | null;
  input: { targetRepo?: string };
  step_outputs: Record<string, unknown>;
  error: string | null;
  report_id: string | null;
  created_at: string;
  completed_at: string | null;
  /** PR tracking (set when the PR opens; merged/closed by the cron sync). */
  pr_number?: number | null;
  pr_url?: string | null;
  pr_state?: "open" | "merged" | "closed" | null;
  merged_at?: string | null;
}

export interface JobState {
  job: AgentJob;
  actions: PlannedAction[];
  audit: AuditRow[];
}

// ── Calls ──────────────────────────────────────────────────────────────────

export const getAgentConfig = () => call<AgentConfig>("GET", "/api/agent/config/");
export const registerGithubApp = () => call<{ url: string }>("POST", "/api/agent/github/register/");
export const connectGithub = () => call<{ url: string }>("POST", "/api/agent/connect/github/");
export const fetchGithubInstallations = (state: string) =>
  call<{ installations: Array<{ id: number; login: string; type: string }> }>(
    "GET",
    `/api/agent/github/link/?state=${encodeURIComponent(state)}`,
  );
export const linkGithubInstallation = (state: string, installationId: number) =>
  call<{ connectionId: string; account: string; repos: string[] }>("POST", "/api/agent/github/link", {
    state,
    installationId,
  });
export const disconnectGithub = (connectionId: string) =>
  call<{ verified: boolean; evidence: Record<string, unknown>; manualSteps: string[]; uninstallUrl: string }>(
    "POST",
    `/api/agent/connections/github/${connectionId}/disconnect/`,
  );
export const startAgentJob = (jobId: string, targetRepo: string) =>
  call<{ jobId: string }>("POST", "/api/agent/jobs/", { jobId, targetRepo });
/** Free fix preview planned from a saved free scan (no report needed); applying still needs a plan. */
export const startAgentJobFromScan = (scanId: string, targetRepo: string) =>
  call<{ jobId: string }>("POST", "/api/agent/jobs/", { scanId, targetRepo });
export const getAgentJobs = () => call<{ jobs: AgentJob[] }>("GET", "/api/agent/jobs/");
export const getAgentJob = (id: string) => call<JobState>("GET", `/api/agent/jobs/${id}/`);
export const advanceAgentJob = (id: string) =>
  call<{ status: string; done?: boolean }>("POST", `/api/agent/jobs/${id}/advance/`);
export const approveAgentJob = (id: string, actionIds: string[] | "all", note?: string) =>
  call<{ ok: boolean; approved: number; rejected: number }>("POST", `/api/agent/jobs/${id}/approve/`, {
    actionIds,
    note,
  });
export const rejectAgentJob = (id: string) => call<{ ok: boolean }>("POST", `/api/agent/jobs/${id}/reject/`);
export const cancelAgentJob = (id: string) => call<{ ok: boolean }>("POST", `/api/agent/jobs/${id}/cancel/`);
export const getAgentReceipt = (id: string) =>
  call<{ content: string; createdAt: string }>("GET", `/api/agent/jobs/${id}/receipt/`);

// ── Guided fixes (engine v2): any platform, no repository ────────────────

export interface GuidedValue {
  label: string;
  value: string;
  /** text: paste into a field; code: paste into a code box (render as text, never as HTML); file: offer a download. */
  kind: "text" | "code" | "file";
  current?: string | null;
  filename?: string;
}
export interface GuidedFix {
  id: string;
  title: string;
  why: string;
  values: GuidedValue[];
  steps: string[];
  /** Set when the platform can't make this change (show instead of steps). */
  blocked?: string;
  status: "todo" | "live" | "not_live" | "blocked";
  checkDetail?: string | null;
  /** Webflow / WordPress connected: Olmene can apply this card for you (after approval) and undo it. */
  auto?: {
    channel: "webflow" | "wordpress";
    changes: Array<{ field: string; label: string; before: string | null; after: string }>;
    applied?: { at: string; ok: boolean; published?: boolean; error?: string };
    revertedAt?: string;
  };
}
export interface GuidedRun {
  id: string;
  site_url: string;
  platform_id: string | null;
  platform: { id: string; label: string; notes?: string };
  fixes: GuidedFix[];
  live_count: number;
  total_count: number;
  last_checked_at: string | null;
  created_at: string;
  scan_id: string | null;
  report_id: string | null;
}
/** From a saved free scan (free, 3/day; 429 rate_limited) or a report (jobId = the analysis job). 422 site_unreachable / nothing_to_fix. */
export const startGuidedRun = (source: { scanId: string } | { jobId: string }) =>
  call<{ run: GuidedRun }>("POST", "/api/agent/guided/", source);
export const getGuidedRuns = () => call<{ runs: Array<Omit<GuidedRun, "fixes" | "platform_id">> }>("GET", "/api/agent/guided/");
export const getGuidedRun = (id: string) => call<{ run: GuidedRun }>("GET", `/api/agent/guided/${id}/`);
/** "I've made the changes": re-check the live site now (429 if called within 20 s). */
export const verifyGuidedRun = (id: string) => call<{ run: GuidedRun }>("POST", `/api/agent/guided/${id}/verify/`);
/** After connecting Webflow/WordPress: mark the cards Olmene can apply (409 not_connected, 422 no_channel). */
export const planGuidedAuto = (id: string) => call<{ run: GuidedRun }>("POST", `/api/agent/guided/${id}/auto/`);
/** Apply approved cards on the platform (402 plan_required for free accounts). */
export const applyGuidedAuto = (id: string, fixIds: string[] | "all") => call<{ run: GuidedRun }>("POST", `/api/agent/guided/${id}/apply/`, { fixIds });
/** Put back the values Olmene replaced (no plan needed). */
export const revertGuidedAuto = (id: string, fixIds: string[]) => call<{ run: GuidedRun }>("POST", `/api/agent/guided/${id}/revert/`, { fixIds });

// ── Site connections (engine v2): Webflow token, WordPress application password ──

export interface SiteConnection {
  id: string;
  provider: "webflow" | "wordpress";
  host: string;
  metadata: Record<string, unknown>;
  lastVerifiedAt: string | null;
  createdAt: string;
}
export const getSiteConnections = () => call<{ connections: SiteConnection[] }>("GET", "/api/agent/connections/site/");
/** 422 connect_failed with a plain reason (token refused, site not on this token…). */
export const connectWebflowSite = (token: string, siteUrl: string) =>
  call<{ connection: { id: string; provider: "webflow"; host: string; siteName: string | null } }>("POST", "/api/agent/connect/webflow/", { token, siteUrl });
/** 403 site_not_yours until the site has been scanned by this user; 422 connect_failed. */
export const connectWordpressSite = (siteUrl: string, username: string, appPassword: string) =>
  call<{ connection: { id: string; provider: "wordpress"; host: string; user: string } }>("POST", "/api/agent/connect/wordpress/", { siteUrl, username, appPassword });
export const disconnectSiteConnection = (id: string) =>
  call<{ ok: boolean; manualSteps: string[] }>("POST", `/api/agent/connections/site/${id}/disconnect/`);

// ── Measure (Search Console impact) ────────────────────────────────────────

export const featureMeasureEnabled = () =>
  (process.env.NEXT_PUBLIC_FEATURE_MEASURE ?? "").toLowerCase() === "true" ||
  (process.env.NEXT_PUBLIC_FEATURE_MEASURE ?? "") === "1";

export const getMeasureOverview = () =>
  call<import("@/lib/measure/types").MeasureOverview>("GET", "/api/measure/overview/");
export const connectSearchConsole = () => call<{ url: string }>("POST", "/api/measure/connect/google/");


// ── Alert channels (engine v2): Slack, Discord, webhooks ──────────────────

export interface AlertChannel {
  id: string;
  kind: "slack" | "discord" | "webhook";
  /** Masked: host/…tail. */
  url: string;
  label: string | null;
  /** Empty = every event. */
  kinds: string[];
  /** false after 10 failed deliveries in a row (PATCH active:true resumes). */
  active: boolean;
  failures: number;
  lastError: string | null;
  lastSentAt: string | null;
  createdAt: string;
}
export const getAlertChannels = () => call<{ channels: AlertChannel[]; kinds: string[] }>("GET", "/api/alerts/channels/");
/** Webhooks return signingSecret once: show it, it's not retrievable later. */
export const addAlertChannel = (input: { kind: AlertChannel["kind"]; url: string; label?: string; kinds?: string[] }) =>
  call<{ channel: Pick<AlertChannel, "id" | "kind" | "url" | "kinds">; signingSecret?: string }>("POST", "/api/alerts/channels/", input);
export const updateAlertChannel = (id: string, patch: { kinds?: string[]; active?: boolean; label?: string }) =>
  call<{ ok: boolean }>("PATCH", `/api/alerts/channels/${id}/`, patch);
export const deleteAlertChannel = (id: string) => call<{ ok: boolean }>("DELETE", `/api/alerts/channels/${id}/`);
export const testAlertChannel = (id: string) => call<{ ok: boolean; queued: boolean }>("POST", `/api/alerts/channels/${id}/test/`);

// ── AI search visibility (engine v2) ──────────────────────────────────────

export interface AiVisibilityAnswer {
  question: string;
  mentioned: boolean;
  cited: boolean;
  rank: number | null;
  competitors: string[];
  sources: string[];
  excerpt: string | null;
}
export interface AiVisibilityRun {
  id: number;
  engine: string;
  mention_share: number;
  cite_share: number;
  competitor_mentions: Record<string, number>;
  results: AiVisibilityAnswer[];
  checked_at: string;
}
/** Site ids come from the `sites` table (RLS: own rows). Runs are newest first, weekly. */
export const getAiVisibility = (siteId: string) =>
  call<{ site: { id: string; host: string; questions: string[]; nextCheckAt: string; competitors: Array<{ name: string; url: string }> }; runs: AiVisibilityRun[] }>("GET", `/api/sites/${siteId}/ai-visibility/`);
export const setAiVisibilityQuestions = (siteId: string, questions: string[]) =>
  call<{ ok: boolean; questions: string[] }>("PUT", `/api/sites/${siteId}/ai-visibility/`, { questions });

// ── Olmene checks on every pull request (engine v2) ──────────────────────

export interface PrCheckRepo { id: string; repo: string; site_url: string; enabled: boolean; last_error: string | null; last_polled_at: string | null; created_at: string }
export interface PrCheck { repo: string; pr_number: number; head_sha: string; preview_url: string | null; conclusion: "success" | "neutral" | "failure"; regressions: string[]; improvements: string[]; check_run_url: string | null; created_at: string }
export const getPrChecks = () => call<{ repos: PrCheckRepo[]; checks: PrCheck[] }>("GET", "/api/agent/pr-checks/");
/** 402 plan_required on free accounts. last_error explains missing GitHub App permissions (Checks: write, Deployments: read). */
export const setPrChecks = (repo: string, enabled: boolean, siteUrl?: string) =>
  call<{ ok: boolean; enabled: boolean }>("POST", "/api/agent/pr-checks/", { repo, enabled, siteUrl });
