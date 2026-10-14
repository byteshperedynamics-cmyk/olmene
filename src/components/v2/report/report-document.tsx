"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { AuditFinding, ReportData, RoadmapAction } from "@/lib/report-types";
import { useI18n } from "@/i18n/provider";
import { EFFORT_KEYS, IMPACT_KEYS, SEVERITY_KEYS, scoreLabelKey } from "@/i18n/keys";
import { cn } from "@/lib/utils";

/**
 * ReportDocument — the report as a board-level reading surface (DESIGN.md):
 * a sticky contents rail that follows the reader, the executive score, buyer
 * segments with fit meters, verified competitors, the conversion and pricing
 * audit as two-chamber cards (observed evidence | recommended fix), and the
 * 7/30/60/90-day plan as swimlanes. Read-only; used by /sample-report/.
 */

const SECTIONS = [
  { id: "r-summary", key: "rv.tab.summary" },
  { id: "r-segments", key: "rv.segments" },
  { id: "r-competitors", key: "rv.tab.competitors" },
  { id: "r-audit", key: "rv.tab.audit" },
  { id: "r-roadmap", key: "rv.tab.roadmap" },
  { id: "r-sources", key: "rv.tab.sources" },
] as const;

const strip = (s: string) => s.replace(/[:：]\s*$/, "").trim();

export function ReportDocument({ data }: { data: ReportData }) {
  const { t } = useI18n();
  const active = useActiveSection(SECTIONS.map((s) => s.id));
  const sourceIds = new Set(data.sources.map((s) => s.id));

  return (
    <div className="grid gap-10 lg:grid-cols-[200px_minmax(0,1fr)]">
      {/* Contents rail */}
      <nav aria-label={t("rv.contents")} className="hidden lg:block">
        <ol className="sticky top-24 grid gap-0.5 border-s border-edge">
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={active === s.id ? "location" : undefined}
                className={cn(
                  "-ms-px flex items-baseline gap-3 border-s py-1.5 ps-4 text-[13px] transition-colors duration-[var(--dur-hover)]",
                  active === s.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="o-readout-strong text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span> {t(s.key)}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid min-w-0 gap-14">
        {/* 01 Executive score */}
        <section id="r-summary" className="scroll-mt-24">
          <Heading n={1} title={t("rv.tab.summary")} />
          <div className="o-artifact grid gap-6 rounded-2xl p-6 sm:p-8 md:grid-cols-[auto_1fr] md:items-center">
            <ScoreDial value={data.executiveSummary.scores.overall} label={t(scoreLabelKey(data.executiveSummary.scores.overall))} />
            <div className="grid min-w-0 gap-4">
              <p className="o-display max-w-[64ch] text-[22px] leading-snug">{data.executiveSummary.headline}</p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
                {(
                  [
                    ["scores.messagingShort", data.executiveSummary.scores.messaging],
                    ["scores.positioning", data.executiveSummary.scores.positioning],
                    ["scores.conversionShort", data.executiveSummary.scores.conversion],
                    ["scores.seoShort", data.executiveSummary.scores.seo],
                    ["scores.trust", data.executiveSummary.scores.trust],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="grid gap-1.5">
                    <dt className="text-[12px] text-muted-foreground">{t(k)}</dt>
                    <dd className="flex items-center gap-2">
                      <span className="o-readout-strong text-[17px]">{v}</span>
                      <Meter value={v} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_1fr]">
            <div className="o-well rounded-2xl p-5 sm:p-6">
              <p className="text-[12px] text-faint font-medium">{t("rv.topFindings")}</p>
              <ol className="mt-3 grid gap-3 text-[14.5px] leading-relaxed">
                {data.executiveSummary.topFindings.map((f, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="o-readout-strong mt-0.5 text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>{" "}
                    <span className="max-w-[64ch] text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="o-artifact rounded-2xl p-5 sm:p-6">
              <p className="text-[12px] text-tel-emerald font-medium">{t("common.biggestOpportunity")}</p>
              <p className="mt-3 text-[15px] leading-relaxed">{data.executiveSummary.biggestOpportunity}</p>
            </div>
          </div>
        </section>

        {/* 02 Buyer segments */}
        <section id="r-segments" className="scroll-mt-24">
          <Heading n={2} title={t("rv.segments")} />
          <div className="grid gap-4 md:grid-cols-2">
            {data.market.segments.map((s) => (
              <div key={s.name} className="o-artifact grid content-start gap-3 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-[16px] font-medium leading-snug">{s.name}</h3>
                  <span className="o-readout-strong shrink-0 text-[12px] text-muted-foreground">
                    {t("rv.fit", { n: s.fitScore })}/100
                  </span>
                </div>
                <Meter value={s.fitScore} wide />
                <p className="text-[14px] leading-relaxed text-muted-foreground">{s.why}</p>
                <p className="o-well rounded-lg px-3 py-2 text-[13px] leading-relaxed text-muted-foreground">
                  <span className="text-foreground">{strip(t("rv.reach"))}</span> · {s.howToReach}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* 03 Verified competitors */}
        <section id="r-competitors" className="scroll-mt-24">
          <Heading n={3} title={t("rv.tab.competitors")} />
          <div className="grid gap-4">
            {data.competitors.map((c) => (
              <div key={c.name} className="o-artifact grid gap-4 rounded-2xl p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-baseline gap-3">
                    <h3 className="text-[16px] font-medium">{c.name}</h3>
                    <span dir="ltr" className="truncate font-mono text-[11.5px] text-tel-sky">
                      {c.url.replace(/^https?:\/\//, "")}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 font-mono text-[11px]",
                      c.threat === "high" ? "border-tel-rose/35 bg-tel-rose/10 text-tel-rose" : c.threat === "medium" ? "border-tel-amber/40 bg-tel-amber/10 text-tel-amber" : "border-rim text-muted-foreground",
                    )}
                  >
                    {t("rv.threat", { v: t(SEVERITY_KEYS[c.threat] ?? c.threat) })}
                  </span>
                </div>
                <p className="max-w-[64ch] text-[14.5px] leading-relaxed text-muted-foreground">{c.positioning}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <List title={t("rv.strengths")} items={c.strengths} />
                  <List title={t("rv.weaknesses")} items={c.weaknesses} />
                </div>
                <p className="text-[14px] leading-relaxed">
                  <span className="text-tel-emerald">{strip(t("rv.gap"))}</span> <span className="text-muted-foreground">{c.gapToExploit}</span>
                </p>
                <Cites ids={c.sourceIds.filter((id) => sourceIds.has(id))} />
              </div>
            ))}
          </div>
        </section>

        {/* 04 Conversion & pricing audit: two-chamber cards */}
        <section id="r-audit" className="scroll-mt-24">
          <Heading n={4} title={t("rv.tab.audit")} />
          <div className="grid gap-8">
            {(
              [
                ["rv.group.conversion", data.audit.conversion],
                ["rv.group.pricingPresentation", data.audit.pricingPresentation],
                ["rv.group.messaging", data.audit.messaging],
                ["rv.group.trust", data.audit.trust],
              ] as const
            ).map(([k, items]) =>
              items.length ? (
                <div key={k} className="grid gap-3">
                  <h3 className="text-[13px] text-faint font-medium">{t(k)}</h3>
                  {items.map((f, i) => (
                    <FindingCard key={i} f={f} evidence={strip(t("rv.evidence"))} fix={strip(t("rv.recommendation"))} />
                  ))}
                </div>
              ) : null,
            )}
          </div>
        </section>

        {/* 05 Roadmap swimlanes */}
        <section id="r-roadmap" className="scroll-mt-24">
          <Heading n={5} title={t("rv.tab.roadmap")} />
          <div className="grid gap-4">
            {(
              [
                ["rv.quickWins", data.roadmap.quickWins],
                ["rt.days30", data.roadmap.days30],
                ["rt.days60", data.roadmap.days60],
                ["rt.days90", data.roadmap.days90],
              ] as const
            ).map(([k, actions]) => (
              <div key={k} className="grid gap-3 lg:grid-cols-[140px_minmax(0,1fr)]">
                <div className="flex items-center gap-2 lg:block">
                  <p className="text-[14px] font-medium">{t(k)}</p>
                  <p className="o-readout-strong text-[11px] text-faint lg:mt-1">{t("rv.actionCount", { n: actions.length })}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {actions.map((a, i) => (
                    <Action key={i} a={a} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Sources */}
        <section id="r-sources" className="scroll-mt-24">
          <Heading n={6} title={t("rv.tab.sources")} />
          <p className="max-w-[64ch] text-[14px] leading-relaxed text-muted-foreground">{t("rv.sourcesNote")}</p>
          <ol className="o-well mt-4 grid divide-y divide-[var(--edge)] rounded-2xl">
            {data.sources.map((s) => (
              <li key={s.id} id={`src-${s.id}`} className="flex scroll-mt-24 items-baseline gap-3 px-4 py-2.5 text-[13.5px]">
                <span className="o-readout-strong w-8 shrink-0 text-[11px] text-tel-sky">{s.id}</span>{" "}
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="shrink-0 text-faint hover:text-foreground" aria-label={s.title}>
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[12.5px] text-faint">{t("rv.aiNote")}</p>
          <p className="mt-6 border-t border-edge pt-4 text-center text-[13px] text-faint font-medium">◼ {t("rv.endOfReport")}</p>
        </section>
      </div>
    </div>
  );
}

function Heading({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="mb-5 flex items-baseline gap-3">
      <span className="o-readout-strong text-[12px] text-faint">{String(n).padStart(2, "0")}</span>{" "}
      <span className="o-display text-[28px] leading-tight">{title}</span>
    </h2>
  );
}

function Meter({ value, wide }: { value: number; wide?: boolean }) {
  const tone = value >= 75 ? "bg-tel-emerald" : value >= 50 ? "bg-tel-amber" : "bg-tel-rose";
  return (
    <span className={cn("block h-1.5 overflow-hidden rounded-full bg-foreground/10", wide ? "w-full" : "w-12")} aria-hidden>
      <span className={cn("block h-full rounded-full", tone)} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </span>
  );
}

function ScoreDial({ value, label }: { value: number; label: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const tone = value >= 75 ? "var(--tel-emerald)" : value >= 50 ? "var(--tel-amber)" : "var(--tel-rose)";
  return (
    <div className="grid justify-items-center gap-2">
      <div className="relative grid size-[124px] place-items-center" dir="ltr">
        <svg viewBox="-60 -60 120 120" className="absolute inset-0 size-full -rotate-90" aria-hidden>
          <circle r={r} fill="none" stroke="var(--line-strong)" strokeWidth="8" />
          <circle r={r} fill="none" stroke={tone} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(c * value) / 100} ${c}`} />
        </svg>
        <span className="o-readout-strong text-[34px] leading-none">{value}</span>
      </div>
      <span className="text-[12px] text-muted-foreground">{label}</span>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="o-well rounded-xl p-3.5">
      <p className="text-[12px] text-faint">{title}</p>
      <ul className="mt-2 grid gap-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function Cites({ ids }: { ids: string[] }) {
  if (!ids.length) return null;
  return (
    <p className="flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <a key={id} href={`#src-${id}`} className="rounded border border-tel-sky/35 px-1.5 font-mono text-[11px] leading-5 text-tel-sky hover:bg-tel-sky/10">
          {id}
        </a>
      ))}
    </p>
  );
}

function FindingCard({ f, evidence, fix }: { f: AuditFinding; evidence: string; fix: string }) {
  const { t } = useI18n();
  const sev = f.severity === "critical" || f.severity === "high" ? "border-tel-rose/35 bg-tel-rose/10 text-tel-rose" : f.severity === "medium" ? "border-tel-amber/40 bg-tel-amber/10 text-tel-amber" : "border-rim text-muted-foreground";
  return (
    <article className="o-artifact overflow-hidden rounded-2xl">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-3.5">
        <h4 className="min-w-0 text-[15px] font-medium leading-snug">{f.title}</h4>{" "}
        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 font-mono text-[11px]", sev)}>{t(SEVERITY_KEYS[f.severity] ?? f.severity)}</span>
      </header>
      <div className="grid md:grid-cols-2">
        <div className="grid content-start gap-2 border-b border-edge p-5 md:border-b-0 md:border-e">
          <p className="flex items-center gap-2 text-[13px] text-tel-amber font-medium">
            <span className="size-1.5 rounded-full bg-tel-amber" aria-hidden /> {evidence}
          </p>
          <p className="text-[14px] leading-relaxed text-muted-foreground">{f.evidence}</p>
        </div>
        <div className="grid content-start gap-2 bg-tel-emerald/[0.05] p-5">
          <p className="flex items-center gap-2 text-[13px] text-tel-emerald font-medium">
            <span className="size-1.5 rounded-full bg-tel-emerald" aria-hidden /> {fix}
          </p>
          <p className="text-[14px] leading-relaxed">{f.recommendation}</p>
        </div>
      </div>
    </article>
  );
}

function Action({ a }: { a: RoadmapAction }) {
  const { t } = useI18n();
  const impact = (a.impact ?? "").toLowerCase();
  return (
    <div className="o-artifact flex min-w-0 flex-col overflow-hidden rounded-xl">
      <div className="grid flex-1 content-start gap-2.5 p-4">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full border border-rim bg-chip px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            {t(EFFORT_KEYS[(a.effort ?? "").toLowerCase()] ?? `${a.effort}`)}
          </span>{" "}
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 font-mono text-[11px]",
              impact === "high" ? "border-tel-emerald/40 bg-tel-emerald/10 text-tel-emerald" : impact === "medium" ? "border-tel-amber/40 bg-tel-amber/10 text-tel-amber" : "border-rim text-muted-foreground",
            )}
          >
            {t(IMPACT_KEYS[impact] ?? impact)}
          </span>
        </div>
        <p className="text-[14px] font-medium leading-snug">{a.title}</p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{a.why}</p>
      </div>
      <p className="o-well border-x-0 border-b-0 px-4 py-2.5 font-mono text-[11px] leading-snug text-muted-foreground">{t("rv.kpi", { v: a.kpi })}</p>
    </div>
  );
}

/** The section currently under the reader's eye (for the contents rail). */
function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return active;
}
