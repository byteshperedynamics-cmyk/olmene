"use client";

import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { ImpactView } from "@/components/v2/measure/impact-view";
import { measureAll } from "@/lib/measure/attribution";
import type { MeasureOverview } from "@/lib/measure/types";
import { sampleClickSeries } from "@/lib/v2/sample-data";
import { cn } from "@/lib/utils";

/** Example overview: the sample series, with outcomes computed by the real attribution code. */
function exampleOverview(): MeasureOverview {
  const s = sampleClickSeries();
  const start = Date.parse("2026-08-01T00:00:00Z");
  const date = (x: number) => new Date(start + (x - 1) * 86_400_000).toISOString().slice(0, 10);
  const daily = s.points.map((p) => ({ date: date(p.x), clicks: p.y, impressions: p.y * 18 }));
  const merges = s.markers.map((m, i) => ({
    jobId: `job-${i}`,
    prNumber: Number(m.label.replace(/\D/g, "")),
    prUrl: `https://github.com/acme/site/pull/${m.label.replace(/\D/g, "")}`,
    mergedAt: date(m.x) + "T12:00:00Z",
  }));
  const outcomes = measureAll(
    daily.map((d) => ({ date: d.date, clicks: d.clicks })),
    merges.map((m) => ({ id: m.jobId, mergedAt: m.mergedAt })),
    daily[daily.length - 1].date,
  ).map((o) => ({
    jobIds: o.ids,
    mergeDate: o.mergeDate,
    status: o.status,
    beforeMean: o.beforeMean,
    afterMean: o.afterMean,
    delta: o.delta,
    deltaPct: o.deltaPct,
    confidence: o.confidence,
    afterDays: o.afterDays,
  }));
  return {
    enabled: true,
    configured: true,
    connection: { property: "sc-domain:acme-analytics.com", status: "active", lastSyncAt: null },
    daily,
    outcomes: outcomes.reverse(),
    merges,
    prs: { opened: 10, merged: merges.length },
    readiness: { first: 61, latest: 94 },
  };
}

const FULL = exampleOverview();
const STATES: Record<string, MeasureOverview> = {
  "with data": FULL,
  "not connected": { ...FULL, connection: null, daily: [], outcomes: [], merges: [] },
  "no merges yet": { ...FULL, merges: [], outcomes: [], prs: { opened: 0, merged: 0 } },
  expired: { ...FULL, connection: { ...FULL.connection!, status: "expired" } },
};

export function ImpactPreview() {
  const [key, setKey] = useState("with data");
  return (
    <main className="o-grid-bg min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto mb-6 flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(STATES).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKey(k)}
              className={cn("rounded-full border px-3 py-1 font-mono text-xs", k === key ? "border-primary bg-leaf-soft text-primary" : "text-muted-foreground")}
            >
              {k}
            </button>
          ))}
          <span className="rounded-full border border-signal-amber/40 px-3 py-1 font-mono text-xs text-signal-amber">example data</span>
        </div>
        <ThemeToggle />
      </div>
      <div className="mx-auto max-w-6xl">
        <ImpactView data={STATES[key]} onConnect={() => {}} connecting={false} />
      </div>
    </main>
  );
}
