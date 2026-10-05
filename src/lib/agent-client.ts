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

// ── Measure (Search Console impact) ────────────────────────────────────────

export const featureMeasureEnabled = () =>
  (process.env.NEXT_PUBLIC_FEATURE_MEASURE ?? "").toLowerCase() === "true" ||
  (process.env.NEXT_PUBLIC_FEATURE_MEASURE ?? "") === "1";

export const getMeasureOverview = () =>
  call<import("@/lib/measure/types").MeasureOverview>("GET", "/api/measure/overview/");
export const connectSearchConsole = () => call<{ url: string }>("POST", "/api/measure/connect/google/");

