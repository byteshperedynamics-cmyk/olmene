"use client";

import { useMemo } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MeasureOverview } from "@/lib/measure/types";
import { sampleClickSeries } from "@/lib/v2/sample-data";
import { ConfidenceBar, Eyebrow, ExampleBadge, LivePill } from "../atoms";
import { ImpactChart, KpiTile } from "../data-viz";
import { Flower } from "../flower";

const STATUS_LABEL: Record<MeasureOverview["outcomes"][number]["status"], string> = {
  early: "Early signal",
  measured: "Measured",
  combined: "Combined effect",
  insufficient: "Not enough data yet",
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const fmtDate = (d: string) => new Date(d + (d.length === 10 ? "T00:00:00Z" : "")).toLocaleDateString([], { month: "short", day: "numeric" });

/**
 * Impact dashboard (brief §5C): what each merged fix measurably changed.
 * Honesty rules: confidence beside every change, absolute numbers beside every
 * percentage, short windows labelled "early signal", "measured change" never
 * "caused".
 */
export function ImpactView({
  data,
  onConnect,
  connecting,
}: {
  data: MeasureOverview;
  onConnect: () => void;
  connecting: boolean;
}) {
  const daily = data.daily;
  const firstMerge = data.merges.map((m) => m.mergedAt.slice(0, 10)).sort()[0];

  const kpi = useMemo(() => {
    const last7 = daily.slice(-7);
    const clicks7 = Math.round(avg(last7.map((d) => d.clicks)));
    const impr7 = Math.round(avg(last7.map((d) => d.impressions)));
    let clicksDelta: string | undefined;
    let positive = false;
    if (firstMerge) {
      const before = daily.filter((d) => d.date < firstMerge).slice(-14);
      if (before.length >= 7 && last7.length >= 7) {
        const b = avg(before.map((d) => d.clicks));
        if (b > 0) {
          const pct = Math.round(((clicks7 - b) / b) * 100);
          clicksDelta = `${pct >= 0 ? "+" : ""}${pct}% vs before the first fix`;
          positive = pct > 0;
        }
      }
    }
    return { clicks7, impr7, clicksDelta, positive };
  }, [daily, firstMerge]);

  if (!data.enabled) {
    return (
      <Centered
        title="Impact tracking isn't switched on yet"
        body="Once it's on, connect Search Console and Olmene measures what every merged fix changed."
      />
    );
  }

  if (!data.connection) {
    const sample = sampleClickSeries();
    return (
      <div className="grid gap-6">
        <section className="grid items-center gap-8 rounded-2xl border bg-card p-6 sm:p-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-4">
            <Eyebrow>Measure</Eyebrow>
            <h2 className="o-display text-[28px] leading-tight">See what every merged fix changed</h2>
            <p className="text-[15px] text-muted-foreground">
              Connect Google Search Console (read-only). Olmene compares the two weeks before and after each merge and shows
              the measured change, with how confident it is.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="sheen" size="xl" onClick={onConnect} disabled={connecting || !data.configured}>
                {connecting ? "Opening Google…" : "Connect Search Console"}
              </Button>
              {!data.configured && <span className="text-[12.5px] text-muted-foreground">Not configured on this deployment yet.</span>}
            </div>
            <p className="text-[12.5px] text-muted-foreground">
              Olmene only reads search clicks and impressions. It can't change anything in your Google account.
            </p>
          </div>
          <div className="relative rounded-xl border bg-background/40 p-4">
            <ExampleBadge label="example" className="absolute end-3 top-3" />
            <ImpactChart points={sample.points} markers={sample.markers} formatX={(x) => `Day ${x}`} ariaLabel="Example chart of daily search clicks with merged fixes marked" />
          </div>
        </section>
        <HowWeMeasure />
      </div>
    );
  }

  const points = daily.map((d, i) => ({ x: i, y: d.clicks }));
  const indexOf = (date: string) => daily.findIndex((d) => d.date >= date.slice(0, 10));
  const markers = data.merges
    .map((m) => ({ x: indexOf(m.mergedAt), label: m.prNumber ? `PR #${m.prNumber}` : "fix" }))
    .filter((m) => m.x >= 0);

  return (
    <div className="grid gap-6">
      {data.connection.status === "expired" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-signal-amber/40 bg-card p-5 text-[14px]">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-signal-amber" aria-hidden /> Search Console access expired. Reconnect to keep measuring.
          </span>
          <Button variant="hairline" onClick={onConnect} disabled={connecting}>
            Reconnect
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Search clicks / day" value={kpi.clicks7} delta={kpi.clicksDelta ?? "7-day average"} positive={kpi.positive} />
        <KpiTile label="Impressions / day" value={kpi.impr7} delta="7-day average" />
        <KpiTile
          label="Readiness"
          value={data.readiness.latest ?? "—"}
          unit={data.readiness.latest !== null ? "/100" : undefined}
          delta={data.readiness.first !== null && data.readiness.first !== data.readiness.latest ? `was ${data.readiness.first}` : "from your latest report"}
          positive={(data.readiness.latest ?? 0) > (data.readiness.first ?? 0)}
        />
        <KpiTile label="Fixes merged" value={data.prs.merged} delta={`of ${data.prs.opened} opened`} />
      </div>

      <section className="rounded-2xl border bg-card p-4 sm:p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-medium">Clicks from Google search</h2>
            <p className="font-mono text-[11px] text-faint" dir="ltr">
              {data.connection.property}
            </p>
          </div>
          <div className="flex gap-4 font-mono text-[10.5px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-0.5 w-3 bg-primary" /> clicks
            </span>
            <span className="flex items-center gap-1.5">
              <i className="inline-block h-3 w-px bg-signal-amber" /> fix merged
            </span>
          </div>
        </div>
        {points.length >= 2 ? (
          <ImpactChart
            points={points}
            markers={markers}
            formatX={(x) => (daily[x] ? fmtDate(daily[x].date) : "")}
            ariaLabel={`Daily search clicks over the last ${daily.length} days, with ${markers.length} merged fixes marked`}
          />
        ) : (
          <div className="grid place-items-center gap-2 py-14 text-center">
            <Flower size={28} variant="breathe" />
            <p className="text-[14px] text-muted-foreground">Search Console data is on its way. The first sync takes up to a day.</p>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b px-5 py-4">
          <h2 className="o-display text-xl">Measured change per fix</h2>
        </div>
        {data.outcomes.length === 0 ? (
          <p className="px-5 py-6 text-[14px] text-muted-foreground">
            {data.merges.length === 0
              ? "Merge your first fix to start measuring. Results appear once there are a few days of data after the merge."
              : "Your merged fixes are being measured. The first numbers appear a few days after each merge."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13.5px]">
              <thead>
                <tr className="border-b font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">
                  <th className="px-5 py-2.5 text-start font-medium">Fix</th>
                  <th className="px-5 py-2.5 text-start font-medium">Merged</th>
                  <th className="px-5 py-2.5 text-start font-medium">Measured change</th>
                  <th className="px-5 py-2.5 text-start font-medium">Confidence</th>
                  <th className="px-5 py-2.5 text-start font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.outcomes.map((o) => {
                  const prs = data.merges.filter((m) => o.jobIds.includes(m.jobId));
                  return (
                    <tr key={o.mergeDate + o.jobIds.join()} className="border-b last:border-0">
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {prs.length
                            ? prs.map((p) =>
                                p.prUrl ? (
                                  <a key={p.jobId} href={p.prUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                                    PR #{p.prNumber} <ExternalLink className="size-3" aria-hidden />
                                  </a>
                                ) : (
                                  <span key={p.jobId}>Fix run</span>
                                ),
                              )
                            : "Fix run"}
                        </div>
                      </td>
                      <td className="px-5 py-3 font-mono text-[12px] text-muted-foreground">{fmtDate(o.mergeDate)}</td>
                      <td className="px-5 py-3">
                        {o.deltaPct === null || o.beforeMean === null || o.afterMean === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="grid gap-0.5">
                            <span className={o.deltaPct > 0 && o.confidence !== "low" ? "text-tel-emerald" : ""}>
                              {o.deltaPct > 0 ? "+" : ""}
                              {o.deltaPct}% clicks
                              {o.trendAdjusted && (
                                <span
                                  className="ms-1.5 inline-block rounded bg-surface-2 px-1 py-px align-middle font-mono text-[10px] font-normal text-muted-foreground"
                                  title="Measured against the trend the site was already on before the merge — not against the raw before-average."
                                >
                                  vs trend
                                </span>
                              )}
                            </span>
                            <span className="font-mono text-[11px] text-faint">
                              {o.beforeMean} → {o.afterMean} per day
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {o.confidence ? (
                          <ConfidenceBar level={o.confidence} label={o.confidence[0].toUpperCase() + o.confidence.slice(1)} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <LivePill tone={o.status === "measured" || o.status === "combined" ? "ok" : "neutral"} pulse={false}>
                          {STATUS_LABEL[o.status]}
                          {o.status === "early" ? ` · ${o.afterDays}/14 days` : ""}
                        </LivePill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <HowWeMeasure />
    </div>
  );
}

function HowWeMeasure() {
  return (
    <details className="rounded-2xl border bg-card px-5 py-4 text-[14px]">
      <summary className="cursor-pointer font-medium">How we measure</summary>
      <ul className="mt-3 grid list-disc gap-1.5 ps-5 text-muted-foreground">
        <li>We compare average daily search clicks in the 14 days before a merge with the 14 days after it, leaving out the merge day. Each window contains every weekday twice, so weekly patterns cancel out.</li>
        <li>Confidence comes from a statistical test on those two windows: high means a change this size would rarely happen by chance.</li>
        <li>With fewer than 14 days since the merge, the result is labelled early signal and can still move.</li>
        <li>Fixes merged within 7 days of each other are measured together as one combined effect. We don&apos;t split credit we can&apos;t separate.</li>
        <li>This is a measured change in your traffic, not proof of cause: seasonality, launches or press can move numbers too.</li>
      </ul>
    </details>
  );
}

function Centered({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto grid max-w-xl justify-items-center gap-3 py-24 text-center">
      <Flower size={32} />
      <p className="o-display text-2xl">{title}</p>
      <p className="text-[14px] text-muted-foreground">{body}</p>
    </div>
  );
}
