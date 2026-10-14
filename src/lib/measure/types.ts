/** Shape returned by GET /api/measure/overview/. */
export interface MeasureOverview {
  enabled: boolean;
  configured: boolean;
  connection: { property: string; status: string; lastSyncAt: string | null } | null;
  daily: Array<{ date: string; clicks: number; impressions: number }>;
  outcomes: Array<{
    jobIds: string[];
    mergeDate: string;
    status: "early" | "measured" | "combined" | "insufficient";
    beforeMean: number | null;
    afterMean: number | null;
    delta: number | null;
    deltaPct: number | null;
    confidence: "low" | "medium" | "high" | null;
    afterDays: number;
    /** Set when traffic was already trending before the merge: delta/deltaPct are measured against this projected baseline. */
    expectedAfterMean?: number | null;
    trendAdjusted?: boolean;
  }>;
  merges: Array<{ jobId: string; prNumber: number | null; prUrl: string | null; mergedAt: string }>;
  prs: { opened: number; merged: number };
  readiness: { first: number | null; latest: number | null };
}
