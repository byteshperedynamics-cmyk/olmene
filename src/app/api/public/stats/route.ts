import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { getEnv } from "@/lib/agent/env";
import { fixerLabel } from "@/components/v2/agent/fixers";
import type { PublicStats } from "@/lib/public-stats-types";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/stats/ — aggregate counts only (brief §6.5). Never returns
 * user ids, emails or repositories of owners who did not opt in. Revenue is
 * included only when PUBLIC_METRICS_SHOW_MRR=true (owner decision).
 */
export async function GET() {
  let data: unknown = null;
  let error: unknown = null;
  try {
    const res = await getServiceDb().rpc("public_stats");
    data = res.data;
    error = res.error;
  } catch (e) {
    error = e; // e.g. service credentials missing in a local build
  }
  if (error || !data) {
    // 200 + flag (not 5xx): a stats outage must never surface as a browser
    // console error on marketing pages; callers keep their fallback numbers.
    return NextResponse.json({ unavailable: true }, { headers: { "Cache-Control": "no-store" } });
  }
  const raw = data as Record<string, unknown>;
  const showMrr = (getEnv("PUBLIC_METRICS_SHOW_MRR") ?? "").toLowerCase() === "true";
  const feed = ((raw.feed as Array<{ merged_at: string; fixers: string[]; repo: string | null }>) ?? []).map((f) => ({
    mergedAt: f.merged_at,
    fixes: (f.fixers ?? []).map(fixerLabel),
    site: f.repo ?? null,
  }));
  const body: PublicStats = {
    freeScans: Number(raw.free_scans ?? 0),
    reports: Number(raw.reports ?? 0),
    sourcesCited: Number(raw.sources_cited ?? 0),
    prsOpened: Number(raw.prs_opened ?? 0),
    prsMerged: Number(raw.prs_merged ?? 0),
    sitesMonitored: Number(raw.sites_monitored ?? 0),
    measuredOutcomes: Number(raw.measured_outcomes ?? 0),
    mrr: showMrr
      ? {
          current: Number(raw.mrr_eur ?? 0),
          weeks: ((raw.mrr_weeks as Array<{ week: string; mrr: number }>) ?? []).map((w) => ({ week: w.week, mrr: Number(w.mrr) })),
        }
      : null,
    feed,
    generatedAt: String(raw.generated_at ?? new Date().toISOString()),
  };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
