/**
 * Guided fix runs (engine v2): create from a saved scan or a report, verify
 * against the live site, and re-check daily for 30 days (cron) until every
 * fix is live — then one "your fixes are live" email.
 *
 * Table public.guided_runs (migration 20261020). Copy drafts come from the
 * same planner the fix agent uses (one small AI call, same budget).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportData } from "@/lib/report-types";
import { buildPlan } from "../planner";
import type { LlmPort } from "../llm";
import { liteReportFromScan, type ScanRow } from "../lite-report";
import { fetchLiveHtml, runLiveCheck } from "../live-check";
import { buildGuidedFixes, livePreviewFor, type GuidedFix } from "./build";
import { detectWordpressSeoPlugin, playbookFor } from "./playbooks";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface GuidedRunRow {
  id: string;
  user_id: string;
  scan_id: string | null;
  report_id: string | null;
  site_url: string;
  platform_id: string | null;
  platform: { id: string; label: string; notes?: string };
  fixes: GuidedFix[];
  live_count: number;
  total_count: number;
  last_checked_at: string | null;
  notified_live_at: string | null;
  created_at: string;
}

export class GuidedError extends Error {
  constructor(public code: "not_found" | "rate_limited" | "site_unreachable" | "nothing_to_fix", message: string) {
    super(message);
  }
}

export const GUIDED_FROM_SCAN_PER_DAY = 3;
const RECHECK_EVERY_MS = 86_400_000;
const RECHECK_FOR_DAYS = 30;

function counts(fixes: GuidedFix[]): { live: number; total: number } {
  const checkable = fixes.filter((f) => f.status !== "blocked");
  return { live: checkable.filter((f) => f.status === "live").length, total: checkable.length };
}

export async function createGuidedRun(
  db: SupabaseClient,
  llm: LlmPort,
  fetchFn: FetchLike,
  userId: string,
  source: { scanId: string } | { reportId: string },
): Promise<GuidedRunRow> {
  let report: ReportData | null = null;
  let platformId: string | null = null;
  let scanId: string | null = null;
  let reportId: string | null = null;
  if ("scanId" in source) {
    const { data: scan } = await db.from("scans").select("id, site_url, result, page_text, profile, user_id, expires_at").eq("id", source.scanId).maybeSingle();
    if (!scan || (scan.user_id && scan.user_id !== userId) || (scan.expires_at && new Date(scan.expires_at) < new Date())) throw new GuidedError("not_found", "That scan doesn't exist or has expired.");
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await db.from("guided_runs").select("id", { count: "exact", head: true }).eq("user_id", userId).not("scan_id", "is", null).gte("created_at", dayAgo);
    if ((count ?? 0) >= GUIDED_FROM_SCAN_PER_DAY) throw new GuidedError("rate_limited", `You've made today's ${GUIDED_FROM_SCAN_PER_DAY} free guided fix lists. Try again tomorrow, or run a full report.`);
    await db.from("scans").update({ user_id: userId, expires_at: null }).eq("id", scan.id);
    report = liteReportFromScan(scan as ScanRow);
    platformId = ((scan.result as { platform?: { id?: string } } | null)?.platform?.id) ?? null;
    scanId = scan.id;
  } else {
    const { data } = await db.from("reports").select("id, user_id, data").eq("id", source.reportId).maybeSingle();
    if (!data || data.user_id !== userId) throw new GuidedError("not_found", "That report doesn't exist.");
    report = data.data as ReportData;
    platformId = report.meta.platformId ?? null;
    reportId = data.id;
  }

  const live = await fetchLiveHtml(report.meta.siteUrl, fetchFn);
  if (!live) throw new GuidedError("site_unreachable", "Olmene couldn't load your homepage just now. Check that the site is up and try again.");
  const playbook = playbookFor(platformId, { wordpressPlugin: platformId === "wordpress" ? detectWordpressSeoPlugin(live.html) : undefined });
  const plan = await buildPlan(report, llm, { homepageHtml: live.html });
  const run = buildGuidedFixes({ report, copy: plan.copy, playbook, liveHtml: live.html });
  if (!run.fixes.length) throw new GuidedError("nothing_to_fix", "Nothing to fix by hand on this page: the checks that failed need no change Olmene can write for you.");
  const c = counts(run.fixes);
  const { data: row, error } = await db.from("guided_runs").insert({
    user_id: userId,
    scan_id: scanId,
    report_id: reportId,
    site_url: report.meta.siteUrl,
    platform_id: platformId,
    platform: run.platform,
    fixes: run.fixes,
    live_count: c.live,
    total_count: c.total,
  }).select("*").single();
  if (error || !row) throw new Error(`guided run insert failed: ${error?.message ?? "no row"}`);
  return row as GuidedRunRow;
}

/** Check every fix on the live page; returns the updated row. */
export async function verifyGuidedRun(db: SupabaseClient, fetchFn: FetchLike, run: GuidedRunRow): Promise<GuidedRunRow> {
  const checkable = run.fixes.filter((f) => f.status !== "blocked");
  const result = await runLiveCheck(run.site_url, checkable.map((f) => ({ fixer_id: f.id, preview: livePreviewFor(f) })), fetchFn);
  const byId = new Map(result.results.map((r) => [r.fixer, r]));
  const fixes = run.fixes.map((f) => {
    if (f.status === "blocked") return f;
    if (result.fetchError) return { ...f, checkDetail: `Couldn't load your site: ${result.fetchError}` };
    const r = byId.get(f.id);
    return r ? { ...f, status: r.ok ? "live" as const : "not_live" as const, checkDetail: r.detail } : f;
  });
  const c = counts(fixes);
  const patch = { fixes, live_count: c.live, total_count: c.total, last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  await db.from("guided_runs").update(patch).eq("id", run.id);
  return { ...run, ...patch };
}

/** Cron: re-check open runs once a day for 30 days; one email when everything is live. */
export async function syncGuidedRuns(db: SupabaseClient, fetchFn: FetchLike, limit = 10): Promise<{ checked: number; allLive: number }> {
  const since = new Date(Date.now() - RECHECK_FOR_DAYS * 86_400_000).toISOString();
  const before = new Date(Date.now() - RECHECK_EVERY_MS).toISOString();
  const { data } = await db.from("guided_runs").select("*")
    .gte("created_at", since)
    .is("notified_live_at", null)
    .or(`last_checked_at.is.null,last_checked_at.lt.${before}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  let checked = 0;
  let allLive = 0;
  for (const run of (data ?? []) as GuidedRunRow[]) {
    const updated = await verifyGuidedRun(db, fetchFn, run).catch(() => null);
    checked++;
    if (updated && updated.total_count > 0 && updated.live_count === updated.total_count) {
      allLive++;
      const { enqueueNotification } = await import("@/lib/notify");
      await enqueueNotification(db, {
        userId: run.user_id,
        kind: "guided_live",
        payload: { runId: run.id, site: new URL(run.site_url).hostname, live: updated.live_count, total: updated.total_count, platform: run.platform?.label ?? null },
        dedupeKey: `guided_live:${run.id}`,
      });
      await db.from("guided_runs").update({ notified_live_at: new Date().toISOString() }).eq("id", run.id);
    }
  }
  return { checked, allLive };
}
