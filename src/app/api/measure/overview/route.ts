import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { requireUser } from "@/lib/agent/http";
import { googleClient, measureEnabled } from "@/lib/measure/google";
import type { MeasureOverview } from "@/lib/measure/types";

export const dynamic = "force-dynamic";

/** GET /api/measure/overview/ — everything the impact dashboard needs, for the signed-in user only. */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const userId = auth.user.id;
  const enabled = measureEnabled();
  const db = getServiceDb();

  const [conn, jobs, reports] = await Promise.all([
    enabled
      ? db
          .from("connections")
          .select("id, status, metadata, last_verified_at")
          .eq("user_id", userId)
          .eq("provider", "google")
          .in("status", ["active", "expired"])
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("agent_jobs").select("id, pr_number, pr_url, pr_state, merged_at").eq("user_id", userId).not("pr_number", "is", null),
    db.from("reports").select("data->executiveSummary->scores->overall, created_at").eq("user_id", userId).order("created_at", { ascending: true }),
  ]);

  const c = conn.data as { id: string; status: string; metadata: { property?: string }; last_verified_at: string | null } | null;
  let daily: MeasureOverview["daily"] = [];
  let outcomes: MeasureOverview["outcomes"] = [];
  if (c) {
    const since = new Date(Date.now() - 95 * 86_400_000).toISOString().slice(0, 10);
    const [d, o] = await Promise.all([
      db.from("gsc_daily").select("date, clicks, impressions").eq("connection_id", c.id).gte("date", since).order("date"),
      db.from("fix_outcomes").select("*").eq("connection_id", c.id).order("merge_date", { ascending: false }),
    ]);
    daily = (d.data as MeasureOverview["daily"] | null) ?? [];
    outcomes = ((o.data as Array<Record<string, unknown>> | null) ?? []).map((r) => ({
      jobIds: r.agent_job_ids as string[],
      mergeDate: r.merge_date as string,
      status: r.status as MeasureOverview["outcomes"][number]["status"],
      beforeMean: r.before_mean === null ? null : Number(r.before_mean),
      afterMean: r.after_mean === null ? null : Number(r.after_mean),
      delta: r.delta === null ? null : Number(r.delta),
      deltaPct: r.delta_pct === null ? null : Number(r.delta_pct),
      confidence: (r.confidence as MeasureOverview["outcomes"][number]["confidence"]) ?? null,
      afterDays: Number(r.after_days ?? 0),
    }));
  }

  const jobRows = (jobs.data as Array<{ id: string; pr_number: number | null; pr_url: string | null; pr_state: string | null; merged_at: string | null }> | null) ?? [];
  const scores = ((reports.data as Array<{ overall: number | null }> | null) ?? []).map((r) => r.overall).filter((v): v is number => typeof v === "number");

  const body: MeasureOverview = {
    enabled,
    configured: !!googleClient(),
    connection: c ? { property: c.metadata?.property ?? "", status: c.status, lastSyncAt: c.last_verified_at } : null,
    daily,
    outcomes,
    merges: jobRows
      .filter((j) => j.pr_state === "merged" && j.merged_at)
      .map((j) => ({ jobId: j.id, prNumber: j.pr_number, prUrl: j.pr_url, mergedAt: j.merged_at as string })),
    prs: { opened: jobRows.length, merged: jobRows.filter((j) => j.pr_state === "merged").length },
    readiness: { first: scores[0] ?? null, latest: scores[scores.length - 1] ?? null },
  };
  return NextResponse.json(body);
}
