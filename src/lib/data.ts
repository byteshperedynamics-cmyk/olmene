"use client";

import { getSupabase } from "./supabase";
import { scopeOwnerId } from "./workspace/client";
import { quotaWindow } from "./quota";
import type { ReportData } from "./report-types";

// ── DB-backed data layer (production mode) ──────────────────────────────
// Mirrors the deployed app: reads analysis_jobs / reports / subscriptions /
// plans directly via the publishable key + RLS.
//
// RLS lets you read every workspace you belong to, so lists are narrowed to
// the one you're working in (its owner's user_id).

const NO_ONE = "00000000-0000-0000-0000-000000000000";
const workspaceOwner = async () => (await scopeOwnerId()) ?? NO_ONE;

export interface Job {
  id: string;
  siteUrl: string;
  goal?: string;
  language?: string;
  productName?: string;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  currentStep: string | null;
  stepLog: StepLogEntry[];
  error: string | null;
  waitReason: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface StepLogEntry {
  step: string;
  status: string;
  startedAt?: string;
  endedAt?: string;
  model?: string;
  error?: string;
}

export interface ReportRow {
  id: string;
  job_id: string;
  title: string;
  data: ReportData;
  created_at: string;
}

export interface Entitlement {
  active: boolean;
  planName: string | null;
  /** Polar product of the active subscription — distinguishes monthly vs yearly of the same plan. */
  productId?: string | null;
  quotaUsed: number;
  quotaTotal: number;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  /** Unclaimed one-time report credits (stack on top of the subscription). */
  reportCredits: number;
  /** Earliest expiry among available credits (null when none). */
  creditsExpireAt: string | null;
  /** Ever bought anything (a subscription or a report credit) — has receipts in the Polar portal. */
  hasPurchases: boolean;
}

export interface Plan {
  polar_product_id: string;
  name: string;
  reports_per_period: number;
  price_label: string;
  sort_order: number;
  active: boolean;
  one_time: boolean;
  /** v2 pricing dimensions (migration 20261002) — null on rows not yet backfilled. */
  slug?: string | null;
  billing_interval?: "month" | "year" | "once" | null;
  monthly_equivalent_eur?: number | null;
  sites_limit?: number | null;
  features_key?: string | null;
  actions_per_period?: number | null;
}

const JOB_SELECT =
  "id, site_url, input, status, current_step, step_log, error, wait_reason, created_at, started_at, completed_at";

type JobRow = {
  id: string;
  site_url: string;
  input: { goal?: string; language?: string; productName?: string } | null;
  status: Job["status"];
  current_step: string | null;
  step_log: StepLogEntry[] | null;
  error: string | null;
  wait_reason: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

/**
 * A failed database read. List screens show it as "couldn't load" (or "no
 * access" for permission errors), never as an empty list. `status` follows
 * the HTTP-like convention the API errors use, so one state component reads both.
 */
export class DataError extends Error {
  status: number;
  code: string;
  constructor(err: { message?: string; code?: string }) {
    super(err.message || "The database didn't answer.");
    this.name = "DataError";
    this.code = err.code ?? "db_error";
    // 42501 insufficient privilege, PGRST301 JWT rejected: a permission problem, not an outage.
    this.status = err.code === "42501" ? 403 : err.code === "PGRST301" ? 401 : 503;
  }
}

function mapJob(r: JobRow): Job {
  return {
    id: r.id,
    siteUrl: r.site_url,
    goal: r.input?.goal,
    language: r.input?.language,
    productName: r.input?.productName,
    status: r.status,
    currentStep: r.current_step,
    stepLog: r.step_log ?? [],
    error: r.error ?? null,
    waitReason: r.wait_reason ?? null,
    createdAt: r.created_at,
    startedAt: r.started_at ?? null,
    completedAt: r.completed_at ?? null,
  };
}

export async function listJobs(): Promise<Job[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  // "Delete my data" empties an analysis and marks it deleted_at instead of
  // removing it (it still counts toward the month's quota); it's gone for the user.
  const { data, error } = await supabase
    .from("analysis_jobs")
    .select(JOB_SELECT)
    .eq("user_id", await workspaceOwner())
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  // A failed read must surface as an error, never as "no analyses".
  if (error) throw new DataError(error);
  return (data ?? []).map(mapJob);
}

export async function getJob(id: string): Promise<Job | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.from("analysis_jobs").select(JOB_SELECT).eq("id", id).is("deleted_at", null).maybeSingle();
  return data ? mapJob(data as JobRow) : null;
}

export async function getReportByJobId(jobId: string): Promise<ReportRow | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from("reports")
    .select("id, job_id, title, data, created_at")
    .eq("job_id", jobId)
    .maybeSingle();
  return (data as ReportRow) ?? null;
}

export async function getEntitlement(): Promise<Entitlement> {
  const supabase = getSupabase();
  const empty: Entitlement = {
    active: false,
    planName: null,
    quotaUsed: 0,
    quotaTotal: 0,
    renewsAt: null,
    cancelAtPeriodEnd: false,
    reportCredits: 0,
    creditsExpireAt: null,
    hasPurchases: false,
  };
  if (!supabase) return empty;
  const now = new Date().toISOString();
  // The plan is the workspace owner's: everyone in a workspace shares it.
  const owner = await workspaceOwner();
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("status, polar_product_id, current_period_start, current_period_end, cancel_at_period_end, updated_at")
    .eq("user_id", owner)
    .order("updated_at", { ascending: false })
    .limit(10);
  const sub = (subs ?? []).find(
    (s: { status: string; current_period_end: string | null }) =>
      ["active", "trialing"].includes(s.status) &&
      (!s.current_period_end || s.current_period_end > now),
  );

  // One-time report credits (task 24): available = unexpired, unclaimed, or
  // claimed by a failed/canceled job (failed analyses never count).
  const { data: creditRows } = await supabase
    .from("report_credits")
    .select("id, job_id, created_at, expires_at")
    .eq("user_id", owner)
    .gt("expires_at", now)
    .order("created_at", { ascending: true })
    .limit(50);
  const credits = creditRows ?? [];
  const claimedJobIds = credits.filter((c: { job_id: string | null }) => c.job_id).map((c: { job_id: string }) => c.job_id);
  let deadJobIds = new Set<string>();
  if (claimedJobIds.length) {
    const { data: claimedJobs } = await supabase
      .from("analysis_jobs")
      .select("id, status")
      .in("id", claimedJobIds);
    deadJobIds = new Set(
      (claimedJobs ?? [])
        .filter((j: { status: string }) => j.status === "failed" || j.status === "canceled")
        .map((j: { id: string }) => j.id),
    );
  }
  const availableCredits = credits.filter(
    (c: { job_id: string | null }) => !c.job_id || deadJobIds.has(c.job_id),
  );
  const creditsExpireAt =
    (availableCredits[0] as { expires_at?: string } | undefined)?.expires_at ?? null;
  // Any subscription row or any credit ever granted means Polar holds receipts.
  let hasPurchases = (subs ?? []).length > 0 || credits.length > 0;
  if (!hasPurchases) {
    const { count: creditsEver } = await supabase.from("report_credits").select("id", { count: "exact", head: true }).eq("user_id", owner);
    hasPurchases = (creditsEver ?? 0) > 0;
  }

  if (!sub) {
    // Credit-only account: total = credits; used = non-failed jobs since the
    // earliest credit was granted.
    if (!availableCredits.length) return { ...empty, hasPurchases };
    const since = (availableCredits[0] as { created_at: string }).created_at;
    const { count } = await supabase
      .from("analysis_jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", owner)
      .gte("created_at", since)
      .not("status", "in", "(failed,canceled)");
    return {
      active: false,
      planName: null,
      quotaUsed: count ?? 0,
      quotaTotal: availableCredits.length,
      renewsAt: null,
      cancelAtPeriodEnd: false,
      reportCredits: availableCredits.length,
      creditsExpireAt,
      hasPurchases,
    };
  }
  const { data: plan } = await supabase
    .from("plans")
    .select("name, reports_per_period, billing_interval")
    .eq("polar_product_id", (sub as { polar_product_id: string }).polar_product_id)
    .maybeSingle();
  // Quota is per month on every plan; yearly plans count per monthly slice.
  const periodStart = quotaWindow(
    (sub as { current_period_start: string | null }).current_period_start ??
      new Date(Date.now() - 30 * 864e5).toISOString(),
    (sub as { current_period_end: string | null }).current_period_end,
    (plan as { billing_interval?: string | null } | null)?.billing_interval,
  ).start;
  const { count } = await supabase
    .from("analysis_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", owner)
    .gte("created_at", periodStart)
    .not("status", "in", "(failed,canceled)");
  return {
    active: true,
    planName: (plan as { name?: string } | null)?.name ?? "Subscribed",
    productId: (sub as { polar_product_id: string }).polar_product_id,
    quotaUsed: count ?? 0,
    quotaTotal: (plan as { reports_per_period?: number } | null)?.reports_per_period ?? 0,
    renewsAt: (sub as { current_period_end: string | null }).current_period_end,
    cancelAtPeriodEnd: (sub as { cancel_at_period_end: boolean | null }).cancel_at_period_end ?? false,
    reportCredits: availableCredits.length,
    creditsExpireAt,
    hasPurchases,
  };
}

export async function getPlans(): Promise<Plan[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  // Retired plans stay readable (a subscriber on one still needs its quota),
  // so only offer the active ones here.
  const { data } = await supabase.from("plans").select("*").eq("active", true).order("sort_order");
  return (data ?? []) as Plan[];
}

// ── Sites and activity (engine v1/v2 tables; RLS: own rows) ──────────────

/** A site Olmene watches: created when a report on it completes. */
export interface SiteRow {
  id: string;
  url: string;
  host: string;
  monitor: boolean;
  last_scan_at: string | null;
  last_score: number | null;
  next_scan_at: string | null;
  created_at: string;
  /** Latest weekly AI search check (null until the first one runs). */
  ai_last: { mentionShare: number; citeShare: number; checkedAt: string } | null;
}

export async function listSites(): Promise<SiteRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("sites")
    .select("id, url, host, monitor, last_scan_at, last_score, next_scan_at, created_at, ai_last")
    .eq("user_id", await workspaceOwner())
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new DataError(error);
  return (data ?? []) as SiteRow[];
}

/** Emails and alerts Olmene queued for the user, newest first (the activity feed). */
export interface NotificationRow {
  id: number;
  kind: string;
  payload: Record<string, unknown>;
  status: "pending" | "sent" | "skipped" | "failed";
  created_at: string;
}

export async function listNotifications(limit = 15): Promise<NotificationRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, payload, status, created_at")
    .eq("user_id", await workspaceOwner())
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new DataError(error);
  return (data ?? []) as NotificationRow[];
}
