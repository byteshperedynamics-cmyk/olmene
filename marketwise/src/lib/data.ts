"use client";

import { getSupabase } from "./supabase";

// ── DB-backed data layer (production mode) ──────────────────────────────
// Mirrors the deployed app: reads analysis_jobs / reports / subscriptions /
// plans directly via the publishable key + RLS.

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
  quotaUsed: number;
  quotaTotal: number;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  /** Unclaimed one-time report credits (stack on top of the subscription). */
  reportCredits: number;
  /** Earliest expiry among available credits (null when none). */
  creditsExpireAt: string | null;
}

export interface Plan {
  polar_product_id: string;
  name: string;
  reports_per_period: number;
  price_label: string;
  sort_order: number;
  active: boolean;
  one_time: boolean;
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
  const { data } = await supabase
    .from("analysis_jobs")
    .select(JOB_SELECT)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []).map(mapJob);
}

export async function getJob(id: string): Promise<Job | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.from("analysis_jobs").select(JOB_SELECT).eq("id", id).maybeSingle();
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
  };
  if (!supabase) return empty;
  const now = new Date().toISOString();
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("status, polar_product_id, current_period_start, current_period_end, cancel_at_period_end, updated_at")
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

  if (!sub) {
    // Credit-only account: total = credits; used = non-failed jobs since the
    // earliest credit was granted.
    if (!availableCredits.length) return empty;
    const since = (availableCredits[0] as { created_at: string }).created_at;
    const { count } = await supabase
      .from("analysis_jobs")
      .select("id", { count: "exact", head: true })
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
    };
  }
  const { data: plan } = await supabase
    .from("plans")
    .select("name, reports_per_period")
    .eq("polar_product_id", (sub as { polar_product_id: string }).polar_product_id)
    .maybeSingle();
  const periodStart =
    (sub as { current_period_start: string | null }).current_period_start ??
    new Date(Date.now() - 30 * 864e5).toISOString();
  const { count } = await supabase
    .from("analysis_jobs")
    .select("id", { count: "exact", head: true })
    .gte("created_at", periodStart)
    .not("status", "in", "(failed,canceled)");
  return {
    active: true,
    planName: (plan as { name?: string } | null)?.name ?? "Subscribed",
    quotaUsed: count ?? 0,
    quotaTotal: (plan as { reports_per_period?: number } | null)?.reports_per_period ?? 0,
    renewsAt: (sub as { current_period_end: string | null }).current_period_end,
    cancelAtPeriodEnd: (sub as { cancel_at_period_end: boolean | null }).cancel_at_period_end ?? false,
    reportCredits: availableCredits.length,
    creditsExpireAt,
  };
}

export async function getPlans(): Promise<Plan[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data } = await supabase.from("plans").select("*").order("sort_order");
  return (data ?? []) as Plan[];
}
