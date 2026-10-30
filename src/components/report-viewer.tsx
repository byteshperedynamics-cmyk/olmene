"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Check, ChevronDown, Copy, Download, ExternalLink, Printer, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ScoreBar, ScoreRing } from "@/components/score-ring";
import { severityClass, statusIconClass, reportToMarkdown, buildActionPlan, realDependency } from "@/lib/format";
import type { ReportData, AuditFinding, SeoCheck, RoadmapAction, ConversionDiff, ConversionDiffField } from "@/lib/report-types";
import { PrintReport } from "@/components/print-report";
import { useI18n } from "@/i18n/provider";
import { SEVERITY_KEYS, STATUS_KEYS, EFFORT_KEYS, IMPACT_KEYS, CONFIDENCE_KEYS, scoreLabelKey } from "@/i18n/keys";

// ── Small building blocks ────────────────────────────────────────────────

/**
 * Sample mode: the public fictional example. Its sources are placeholders,
 * so they are never links and never invite verification.
 */
const ReportMode = createContext<{ sample: boolean }>({ sample: false });

/**
 * Citation chips. Pressing one opens the source in place (title, address,
 * retrieval date, a link that opens in a new tab), so the reader never loses
 * their position in the report.
 */
function SourceRefs({ ids, sources }: { ids?: string[]; sources: ReportData["sources"] }) {
  const { t } = useI18n();
  const { sample } = useContext(ReportMode);
  if (!ids?.length) return null;
  return (
    <span className="ms-1 inline-flex flex-wrap gap-1 align-middle font-mono text-[11px] text-tel-sky">
      {ids.map((id) => {
        const s = sources.find((x) => x.id === id);
        if (!s) return <span key={id}>[{id}]</span>;
        let host = "";
        try {
          host = new URL(s.url).hostname;
        } catch {
          /* not a URL: show the title only */
        }
        return (
          <Popover key={id}>
            <PopoverTrigger
              aria-label={t("rv.citeAria", { id, title: s.title })}
              className="o-hit relative rounded border border-tel-sky/35 px-1 leading-4 hover:bg-tel-sky/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {id}
            </PopoverTrigger>
            <PopoverContent align="start" className="grid w-[min(22rem,calc(100vw-2rem))] gap-1.5 p-3.5 font-sans text-[13px]">
              <p className="font-mono text-[11px] text-tel-sky">{id}</p>
              <p className="font-medium leading-snug">{s.title}</p>
              {sample ? (
                <p className="text-muted-foreground">{t("sample.sourcePlaceholder")}</p>
              ) : (
                <>
                  {host && (
                    <p className="truncate font-mono text-[11.5px] text-muted-foreground" dir="ltr">
                      {host}
                    </p>
                  )}
                  <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex w-fit items-center gap-1 font-medium underline underline-offset-4">
                    {t("rv.openSource")} <ExternalLink className="size-3" aria-hidden />
                  </a>
                </>
              )}
            </PopoverContent>
          </Popover>
        );
      })}
    </span>
  );
}

/** engine v2: a market number that isn't in any of its cited sources. */
function Unverified() {
  const { t } = useI18n();
  return (
    <span className="ms-2 inline-flex items-center gap-1 rounded-full border border-tel-amber/40 bg-tel-amber/10 px-2 py-0.5 align-middle font-mono text-[11px] font-normal text-tel-amber">
      <TriangleAlert className="size-3" aria-hidden /> {t("rv.unverified")}
    </span>
  );
}

/** engine v2: mobile lab speed from PageSpeed Insights, labelled as a lab test. */
function SpeedBlock({ speed }: { speed: NonNullable<ReportData["meta"]["speed"]> }) {
  const { t } = useI18n();
  const tone = (good: boolean, ok: boolean) => (good ? "text-tel-emerald" : ok ? "text-tel-amber" : "text-tel-rose");
  const rows: Array<[string, string | null, string]> = [
    ["rv.speedPerf", speed.performance == null ? null : `${speed.performance}/100`, speed.performance == null ? "" : tone(speed.performance >= 90, speed.performance >= 50)],
    ["rv.speedLcp", speed.lcpMs == null ? null : `${(speed.lcpMs / 1000).toFixed(1)} s`, speed.lcpMs == null ? "" : tone(speed.lcpMs <= 2500, speed.lcpMs <= 4000)],
    ["rv.speedCls", speed.cls == null ? null : speed.cls.toFixed(2), speed.cls == null ? "" : tone(speed.cls <= 0.1, speed.cls <= 0.25)],
    ["rv.speedTbt", speed.tbtMs == null ? null : `${Math.round(speed.tbtMs)} ms`, speed.tbtMs == null ? "" : tone(speed.tbtMs <= 200, speed.tbtMs <= 600)],
  ];
  return (
    <div>
      <h3 className="font-display text-lg font-semibold">{t("rv.speedTitle")}</h3>
      <dl className="o-artifact mt-3 grid grid-cols-2 gap-4 rounded-2xl p-5 sm:grid-cols-4 print-block">
        {rows.map(([k, v, cls]) => (
          <div key={k} className="grid gap-1">
            <dt className="text-xs text-muted-foreground">{t(k)}</dt>
            <dd className={`o-readout-strong text-lg ${v ? cls : "text-faint"}`}>{v ?? "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-faint">{t("rv.speedNote")}</p>
    </div>
  );
}

const label = (s: string) => s.replace(/[:：]\s*$/, "").trim();

/**
 * A finding as observation → evidence → recommendation. The evidence is one
 * press away on screen and always printed.
 */
function FindingCard({ f, sources }: { f: AuditFinding; sources: ReportData["sources"] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border bg-card p-4 print-block">
      <div className="flex flex-wrap items-start gap-2">
        <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ${severityClass(f.severity)}`}>{t(SEVERITY_KEYS[f.severity] ?? f.severity)}</span>
        <p className="min-w-0 flex-1 font-medium leading-snug">{f.title}</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="o-hit relative mt-2.5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground print:hidden"
      >
        <ChevronDown className={cn("size-3.5 transition-transform duration-[var(--dur-state)]", !open && "-rotate-90 rtl:rotate-90")} aria-hidden />
        {label(t("rv.evidence"))}
      </button>
      <p className={cn("mt-1.5 text-sm leading-relaxed text-muted-foreground", open ? "block" : "hidden print:block")}>
        <span className="font-medium text-foreground print:inline">{t("rv.evidence")}</span>
        {f.evidence}
      </p>
      <p className="mt-2 text-sm leading-relaxed">
        <span className="font-medium">{t("rv.recommendation")}</span>
        {f.recommendation}
      </p>
      <SourceRefs ids={(f as AuditFinding & { sourceIds?: string[] }).sourceIds} sources={sources} />
    </div>
  );
}

function SeoCheckRow({ c }: { c: SeoCheck }) {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-3 border-b py-2.5 last:border-b-0 print-block">
      <span className={`mt-0.5 font-mono text-xs ${statusIconClass(c.status)}`} aria-label={t(STATUS_KEYS[c.status] ?? c.status)}>
        {c.status === "pass" ? "✓" : c.status === "warn" ? "!" : "✗"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{c.check}</p>
        <p className="text-xs text-muted-foreground">{c.detail}</p>
      </div>
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${
          c.status === "pass" ? "sev-pass" : c.status === "warn" ? "sev-warn" : "sev-fail"
        }`}
      >
        {t(STATUS_KEYS[c.status] ?? c.status)}
      </span>
    </div>
  );
}

// ── Section renderers ───────────────────────────────────────────────────

const COPY_KIND_KEYS: Record<ConversionDiffField["kind"], string> = {
  h1: "rv.copyKind.h1",
  subheadline: "rv.copyKind.subheadline",
  cta: "rv.copyKind.cta",
};

/**
 * "Copy you can paste today" — the grounded hero rewrites from the pipeline's
 * gitdiff step. `snippetHtml` is engine-escaped HTML of the real element with
 * the new text swapped in; rendered as text (never dangerouslySetInnerHTML).
 */
export function ConversionDiffSection({ diff }: { diff: ConversionDiff }) {
  const { t } = useI18n();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    } catch {
      toast.error(t("rv.toastCopyFail"));
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-display text-lg font-semibold">{t("rv.copyTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("rv.copyBody")}</p>
      </div>
      {diff.fields.map((f) => (
        <div key={f.kind} className="o-artifact rounded-xl p-4 print-block">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-rim bg-chip px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
              {t(COPY_KIND_KEYS[f.kind])}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground" dir="ltr">
              {f.tag ? `<${f.tag}>` : null}
            </span>
            {f.lengthWarn && (
              <span className="rounded bg-signal-amber/10 px-1.5 py-0.5 text-[11px] font-medium text-signal-amber">
                {t("rv.copyLengthWarn", { n: f.lengthDelta })}
              </span>
            )}
          </div>
          <div className="mt-3 grid gap-2 text-sm leading-relaxed">
            <p className="text-muted-foreground">
              <span className="me-1.5 inline-block w-12 shrink-0 text-[11px] font-semibold uppercase tracking-wide">{t("rv.copyBefore")}</span>
              <span className="line-through decoration-muted-foreground/50">{f.before}</span>
            </p>
            <p>
              <span className="me-1.5 inline-block w-12 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-tel-emerald">{t("rv.copyAfter")}</span>
              <span className="font-medium">{f.after}</span>
            </p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{t("rv.copyWhy")}</span>{" "}
            {f.rationale}
          </p>
          <div className="o-well mt-3 overflow-hidden rounded-lg" dir="ltr">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-faint">HTML</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => copy(`${f.kind}:text`, f.after)}
                  className="rounded px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {copiedKey === `${f.kind}:text` ? t("rv.copied") : t("rv.copyText")}
                </button>
                <button
                  type="button"
                  onClick={() => copy(`${f.kind}:html`, f.snippetHtml)}
                  className="rounded px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {copiedKey === `${f.kind}:html` ? t("rv.copied") : t("rv.copyHtml")}
                </button>
              </div>
            </div>
            <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[12px] leading-relaxed">
              <code>{f.snippetHtml}</code>
            </pre>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SummarySection({ r }: { r: ReportData }) {
  const { t } = useI18n();
  const s = r.executiveSummary.scores;
  return (
    <div className="space-y-6">
      <div className="o-artifact grid items-center gap-8 rounded-2xl p-6 sm:grid-cols-[auto_1fr] print-block">
        <ScoreRing value={s.overall} size={128} label={`${t(scoreLabelKey(s.overall))} · ${t("scores.of100")}`} />
        <div className="grid gap-3">
          <ScoreBar label={t("scores.messagingShort")} value={s.messaging} />
          <ScoreBar label={t("scores.positioning")} value={s.positioning} />
          <ScoreBar label={t("scores.conversionShort")} value={s.conversion} />
          <ScoreBar label={t("scores.seoShort")} value={s.seo} />
          <ScoreBar label={t("scores.trust")} value={s.trust} />
        </div>
      </div>
      <p className="text-[13px] leading-relaxed text-muted-foreground print-block">
        <span className="font-medium text-foreground">{t("rv.scoreNote.title")}</span> {t("rv.scoreNote.body")}
      </p>
      <p className="font-display text-xl font-semibold leading-snug text-balance">
        {r.executiveSummary.headline}
        {r.meta.quality?.headlineUnverified && <Unverified />}
      </p>
      <div>
        <h3 className="font-display text-lg font-semibold">{t("rv.topFindings")}</h3>
        <ul className="mt-3 space-y-2.5">
          {r.executiveSummary.topFindings.map((f, i) => (
            <li key={i} className="flex items-start gap-2.5 leading-relaxed">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-faint" aria-hidden />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="o-artifact rounded-xl p-5 print-block">
        <p className="text-xs font-semibold uppercase tracking-wider text-tel-emerald">{t("common.biggestOpportunity")}</p>
        <p className="mt-1.5 leading-relaxed">{r.executiveSummary.biggestOpportunity}</p>
      </div>
      {r.conversionDiff?.fields?.length ? <ConversionDiffSection diff={r.conversionDiff} /> : null}
    </div>
  );
}

export function ProductSection({ r }: { r: ReportData }) {
  const { t } = useI18n();
  const p = r.product;
  return (
    <div className="space-y-6">
      <p className="font-display text-lg font-semibold">{p.name} — {p.category}</p>
      <p className="leading-relaxed text-muted-foreground">{p.oneLiner}</p>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="o-artifact rounded-2xl p-5 print-block">
          <h3 className="font-semibold">{t("rv.offerings")}</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {p.offerings.map((o, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-faint" aria-hidden />{o}</li>)}
          </ul>
        </div>
        <div className="o-artifact rounded-2xl p-5 print-block">
          <h3 className="font-semibold">{t("rv.pricingModel")}</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{p.pricingModel}</p>
        </div>
      </div>
      <div>
        <h3 className="font-semibold">{t("rv.targetCustomers")}</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {p.targetCustomers.map((tc, i) => (
            <span key={i} className="rounded-full border border-rim bg-chip px-3 py-1 text-sm text-muted-foreground">{tc}</span>
          ))}
        </div>
      </div>
      <div>
        <h3 className="font-semibold">{t("rv.valueProps")}</h3>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {p.valueProps.map((v, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-faint" aria-hidden />{v}</li>)}
        </ul>
      </div>
    </div>
  );
}

export function MarketSection({ r }: { r: ReportData }) {
  const { t } = useI18n();
  const m = r.market;
  return (
    <div className="space-y-6">
      <p className="leading-relaxed">{m.definition}</p>
      <div className="o-artifact grid gap-4 rounded-2xl p-5 sm:grid-cols-3 print-block">
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("rv.marketSize")}</p>
          <p className="mt-1 font-display text-xl font-bold">
            {m.size.value}
            {m.size.verified === false && <Unverified />}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{m.size.basis}</p>
        </div>
        <div className="sm:text-end">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("rv.confidence")}</p>
          <p className="mt-1 inline-flex rounded-full bg-secondary px-3 py-1 text-sm font-medium capitalize">
            {t(CONFIDENCE_KEYS[m.size.confidence] ?? m.size.confidence)}
          </p>
        </div>
        <SourceRefs ids={m.size.sourceIds} sources={r.sources} />
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold">{t("rv.trends")}</h3>
        <div className="mt-3 space-y-3">
          {m.trends.map((tr, i) => (
            <div key={i} className="o-artifact rounded-xl p-4 print-block">
              <p className="font-medium">
                {tr.trend}
                <SourceRefs ids={tr.sourceIds} sources={r.sources} />
                {tr.verified === false && <Unverified />}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{tr.implication}</p>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold">{t("rv.segments")}</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {m.segments.map((s, i) => (
            <div key={i} className="o-artifact rounded-xl p-4 print-block">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium">{s.name}</p>
                <span className="o-readout-strong text-sm text-muted-foreground">{t("rv.fit", { n: s.fitScore })}</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.why}</p>
              <p className="mt-1.5 text-sm"><span className="font-medium">{t("rv.reach")}</span><span className="text-muted-foreground">{s.howToReach}</span></p>
            </div>
          ))}
        </div>
      </div>
      <p className="o-well rounded-xl p-4 leading-relaxed print-block">{m.potentialAssessment}</p>
    </div>
  );
}

export function CompetitorsSection({ r }: { r: ReportData }) {
  const { t } = useI18n();
  const { sample } = useContext(ReportMode);
  return (
    <div className="space-y-4">
      {r.competitors.map((c, i) => (
        <div key={i} className="o-artifact rounded-2xl p-5 print-block">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="font-display text-lg font-semibold">{c.name}</p>
              {sample ? (
                <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                  {new URL(c.url).hostname}
                </span>
              ) : (
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-tel-sky hover:underline">
                  <ExternalLink className="size-3" aria-hidden />
                  {new URL(c.url).hostname}
                </a>
              )}
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              c.threat === "high" ? "sev-fail" : c.threat === "medium" ? "sev-warn" : "sev-low"
            }`}>
              {t("rv.threat", { v: t(SEVERITY_KEYS[c.threat] ?? c.threat) })}
            </span>
          </div>
          <SourceRefs ids={c.sourceIds} sources={r.sources} />
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.positioning}</p>
          {c.pricing && <p className="mt-1 text-sm"><span className="font-medium">{t("rv.pricing")}</span><span className="text-muted-foreground">{c.pricing}</span></p>}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider score-good">{t("rv.strengths")}</p>
              <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                {c.strengths.map((s, j) => <li key={j} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-score-good" aria-hidden />{s}</li>)}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider score-bad">{t("rv.weaknesses")}</p>
              <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                {c.weaknesses.map((s, j) => <li key={j} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-score-bad" aria-hidden />{s}</li>)}
              </ul>
            </div>
          </div>
          <p className="o-well mt-4 rounded-lg p-3 text-sm leading-relaxed">
            <span className="font-semibold text-tel-emerald">{t("rv.gap")}</span>
            {c.gapToExploit}
          </p>
        </div>
      ))}
    </div>
  );
}

export function AuditSection({ r }: { r: ReportData }) {
  const { t } = useI18n();
  const a = r.audit;
  const groups: [string, AuditFinding[]][] = [
    [t("rv.group.messaging"), a.messaging],
    [t("rv.group.conversion"), a.conversion],
    [t("rv.group.trust"), a.trust],
    [t("rv.group.pricingPresentation"), a.pricingPresentation],
  ];
  const passed = a.seo.checklist.filter((c) => c.status === "pass").length;
  return (
    <div className="space-y-8">
      {groups.map(([title, findings]) => (
        <div key={title}>
          <h3 className="font-display text-lg font-semibold">{title}</h3>
          <div className="mt-3 space-y-3">
            {findings.length ? (
              findings.map((f, i) => <FindingCard key={i} f={f} sources={r.sources} />)
            ) : (
              <p className="text-sm text-muted-foreground">{t("rv.noFindings")}</p>
            )}
          </div>
        </div>
      ))}
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-lg font-semibold">{t("rv.seoChecklist")}</h3>
          <span className="font-mono text-sm text-muted-foreground">
            {t("rv.seoPassed", { a: passed, b: a.seo.checklist.length })}
          </span>
        </div>
        <div className="o-well mt-3 rounded-xl px-4 print-block">
          {a.seo.checklist.map((c, i) => <SeoCheckRow key={i} c={c} />)}
        </div>
      </div>
      {r.meta.speed ? <SpeedBlock speed={r.meta.speed} /> : null}
      <div>
        <h3 className="font-display text-lg font-semibold">{t("rv.seoFindings")}</h3>
        <div className="mt-3 space-y-3">
          {a.seo.findings.length ? (
            a.seo.findings.map((f, i) => <FindingCard key={i} f={f} sources={r.sources} />)
          ) : (
            <p className="text-sm text-muted-foreground">{t("rv.noFindings")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function StrategySection({ r }: { r: ReportData }) {
  const { t } = useI18n();
  const s = r.strategy;
  return (
    <div className="space-y-6">
      <div className="o-artifact rounded-2xl p-5 print-block">
        <p className="text-xs font-semibold uppercase tracking-wider text-faint">{t("rv.positioning")}</p>
        <p className="mt-2 font-display text-lg font-semibold leading-snug">{s.positioning.statement}</p>
      </div>
      <div>
        <h3 className="font-semibold">{t("rv.differentiators")}</h3>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {s.positioning.differentiators.map((d, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-faint" aria-hidden />{d}</li>)}
        </ul>
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold">{t("rv.icp")}</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {s.icp.map((i, j) => (
            <div key={j} className="o-artifact rounded-xl p-4 print-block">
              <p className="font-medium">{i.persona}</p>
              <p className="mt-2 text-sm"><span className="font-medium">{t("rv.painPoints")}</span><span className="text-muted-foreground">{i.painPoints.join("; ")}</span></p>
              <p className="mt-1 text-sm"><span className="font-medium">{t("rv.triggers")}</span><span className="text-muted-foreground">{i.triggers.join("; ")}</span></p>
              {i.objections?.length ? (
                <p className="mt-1 text-sm"><span className="font-medium">{t("rv.objections")}</span><span className="text-muted-foreground">{i.objections.join("; ")}</span></p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {s.channels?.length ? (
        <div>
          <h3 className="font-display text-lg font-semibold">{t("rv.channels")}</h3>
          <div className="mt-3 space-y-3">
            {s.channels.map((c, i) => (
              <div key={i} className="o-artifact rounded-xl p-4 print-block">
                <div className="flex items-baseline gap-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full border border-rim bg-chip font-mono text-xs font-medium text-foreground">{c.priority}</span>
                  <p className="font-medium">{c.channel}</p>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">{c.rationale}</p>
                {c.firstSteps?.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {c.firstSteps.map((f, k) => <li key={k} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-faint" aria-hidden />{f}</li>)}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {s.offerAndPricingIdeas?.length ? (
        <div>
          <h3 className="font-display text-lg font-semibold">{t("rv.offerIdeas")}</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {s.offerAndPricingIdeas.map((o, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-faint" aria-hidden />{o}</li>)}
          </ul>
        </div>
      ) : null}
      {s.contentThemes?.length ? (
        <div>
          <h3 className="font-display text-lg font-semibold">{t("rv.contentThemes")}</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {s.contentThemes.map((ct, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-faint" aria-hidden />{ct}</li>)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function RoadmapSection({ r }: { r: ReportData }) {
  const { t } = useI18n();
  const phases: [string, string, RoadmapAction[]][] = [
    ["7", t("rv.quickWins"), r.roadmap.quickWins ?? []],
    ["30", t("rt.days30"), r.roadmap.days30 ?? []],
    ["60", t("rt.days60"), r.roadmap.days60 ?? []],
    ["90", t("rt.days90"), r.roadmap.days90 ?? []],
  ];
  return (
    <div className="space-y-8">
      {phases.map(([days, label, items]) => (
        <div key={days}>
          <div className="flex items-center gap-3">
            <span className="o-readout-strong grid size-9 shrink-0 place-items-center rounded-full border border-rim bg-chip text-sm text-foreground">
              {days}
            </span>
            <h3 className="font-display text-lg font-semibold">{label}</h3>
            <span className="text-sm text-muted-foreground">({t("rv.actionCount", { n: items.length })})</span>
          </div>
          <div className="mt-3 space-y-3">
            {items.map((a, i) => (
              <div key={i} className="o-artifact rounded-xl p-4 print-block">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium">{i + 1}. {a.title}</p>
                  <span className="flex shrink-0 gap-1.5 text-xs">
                    <span className="rounded bg-secondary px-2 py-0.5 capitalize">
                      {t(EFFORT_KEYS[(a.effort ?? "").toLowerCase()] ?? `${a.effort} effort`)}
                    </span>
                    <span className={`rounded px-2 py-0.5 font-medium capitalize ${
                      a.impact === "high" ? "sev-pass" : "bg-secondary"
                    }`}>{t(IMPACT_KEYS[a.impact] ?? `${a.impact} impact`)}</span>
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground"><span className="font-medium text-foreground">{t("rv.why")}</span>{a.why}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground"><span className="font-medium text-foreground">{t("rv.how")}</span>{a.how}</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <span className="font-mono rounded bg-muted px-1.5 py-0.5 text-xs">{t("rv.kpi", { v: a.kpi })}</span>
                  {realDependency(a.dependsOn) ? <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{t("rv.dependsOn", { v: a.dependsOn ?? "" })}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RisksSection({ r }: { r: ReportData }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      {r.risks.map((k, i) => (
        <div key={i} className="o-artifact rounded-xl p-4 print-block">
          <p className="font-medium">{k.risk}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground"><span className="font-medium text-foreground">{t("rv.mitigation")}</span>{k.mitigation}</p>
        </div>
      ))}
      <div className="o-well rounded-xl p-4 print-block">
        <h3 className="font-semibold">{t("rv.assumptions")}</h3>
        <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
          {r.assumptions.map((a, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-faint" aria-hidden />{a}</li>)}
        </ul>
      </div>
    </div>
  );
}

export function SourcesSection({ r }: { r: ReportData }) {
  const { t } = useI18n();
  const { sample } = useContext(ReportMode);
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{t(sample ? "sample.sourcesNote" : "rv.sourcesNote")}</p>
      {r.meta.quality && r.meta.quality.claimsChecked > 0 ? (
        <p className="text-xs text-faint">
          {r.meta.quality.claimsUnverified > 0
            ? t("rv.qualityNote", { checked: r.meta.quality.claimsChecked, unverified: r.meta.quality.claimsUnverified })
            : t("rv.qualityAll", { checked: r.meta.quality.claimsChecked })}
        </p>
      ) : null}
      <ol className="space-y-2">
        {r.sources.map((s) => (
          <li key={s.id} id={`src-${s.id}`} className="flex scroll-mt-24 items-start gap-3 rounded-xl border bg-card p-3 print-block">
            <span className="o-readout-strong w-8 shrink-0 text-sm text-tel-sky">{s.id}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{s.title}</p>
              {sample ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{t("sample.sourcePlaceholder")}</p>
              ) : (
                <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-0.5 block truncate text-xs text-muted-foreground hover:text-foreground" dir="ltr">
                  {s.url}
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Main viewer ─────────────────────────────────────────────────────────

const SECTION_IDS = ["summary", "product", "market", "competitors", "audit", "strategy", "roadmap", "risks", "sources"] as const;
type SectionId = (typeof SECTION_IDS)[number];

const SECTION_RENDER: Record<SectionId, (r: ReportData) => React.ReactNode> = {
  summary: (r) => <SummarySection r={r} />,
  product: (r) => <ProductSection r={r} />,
  market: (r) => <MarketSection r={r} />,
  competitors: (r) => <CompetitorsSection r={r} />,
  audit: (r) => <AuditSection r={r} />,
  strategy: (r) => <StrategySection r={r} />,
  roadmap: (r) => <RoadmapSection r={r} />,
  risks: (r) => <RisksSection r={r} />,
  sources: (r) => <SourcesSection r={r} />,
};

/**
 * The one report reading system (refinement 2026-10-30), for signed-in
 * reports and the public sample alike: every section in one document, a
 * sticky contents rail on desktop and a contents selector on phones, the
 * score method next to the scores, findings as observation → evidence →
 * recommendation, citations that open in place, exports, and the print face.
 * `sample` marks the fictional example: placeholder sources, no outbound links.
 */
export function ReportViewer({ data, sample = false }: { data: ReportData; sample?: boolean }) {
  const { t, lang } = useI18n();
  const [copied, setCopied] = useState(false);
  const active = useActiveSection(SECTION_IDS.map((id) => `r-${id}`));
  const locale = lang === "en" ? undefined : lang;
  const date = new Date(data.meta.generatedAt).toLocaleDateString(locale ?? undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  function exportMarkdown() {
    const md = reportToMarkdown(data, sample);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.product.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${sample ? "fictional-sample" : "marketing-report"}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(t("rv.toastExported"));
  }

  async function copyActionPlan() {
    try {
      await navigator.clipboard.writeText(buildActionPlan(data, sample));
      setCopied(true);
      toast.success(t("rv.toastCopied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("rv.toastCopyFail"));
    }
  }

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    // Move focus to the section heading so keyboard and screen reader users land there too.
    el.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  };

  return (
    <ReportMode.Provider value={{ sample }}>
      <div data-surface="report">
        {/* Premium print/PDF face — replaces the interactive viewer on paper */}
        <div className="hidden print:block">
          <PrintReport data={data} sample={sample} />
        </div>

        <div className="print:hidden">
          {/* Toolbar */}
          <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {sample ? <span>{t("sample.badge")}</span> : <span dir="ltr">{data.meta.siteUrl}</span>}
              {data.meta.category ? ` · ${data.meta.category.label}` : ""} · {t("rv.generated", { date })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={exportMarkdown}>
                <Download className="size-4" aria-hidden /> {t("rv.export")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="size-4" aria-hidden /> {t("rv.print")}
              </Button>
              <Button variant="outline" size="sm" onClick={copyActionPlan}>
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {t("rv.copyPlan")}
              </Button>
            </div>
          </div>

          <p className="mb-6 rounded-lg border bg-card px-4 py-2.5 text-xs leading-relaxed text-muted-foreground print-block">{t(sample ? "sample.badgeTip" : "rv.aiNote")}</p>

          {/* Phones and tablets: a contents selector that stays at hand */}
          <div className="sticky top-16 z-20 -mx-1 mb-6 bg-background/95 px-1 py-2 backdrop-blur lg:hidden">
            <label htmlFor="report-contents" className="sr-only">
              {t("rv.contents")}
            </label>
            <div className="relative">
              <select
                id="report-contents"
                value={active}
                onChange={(e) => jump(e.target.value)}
                className="h-11 w-full appearance-none rounded-md border border-rim bg-card pe-9 ps-3 text-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {SECTION_IDS.map((id, i) => (
                  <option key={id} value={`r-${id}`}>
                    {i + 1}. {t(`rv.tab.${id}`)}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            </div>
          </div>

          <div className="grid gap-10 lg:grid-cols-[184px_minmax(0,1fr)]">
            <nav aria-label={t("rv.contents")} className="hidden lg:block">
              <ol className="sticky top-24 grid gap-0.5 border-s border-edge">
                {SECTION_IDS.map((id, i) => (
                  <li key={id}>
                    <a
                      href={`#r-${id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        jump(`r-${id}`);
                        history.replaceState(null, "", `#r-${id}`);
                      }}
                      aria-current={active === `r-${id}` ? "location" : undefined}
                      className={cn(
                        "-ms-px flex items-baseline gap-2.5 border-s py-1.5 ps-4 text-[13px] transition-colors duration-[var(--dur-hover)]",
                        active === `r-${id}` ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span className="o-readout-strong text-[11px] text-faint">{i + 1}</span> {t(`rv.tab.${id}`)}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="grid min-w-0 gap-14">
              {SECTION_IDS.map((id, i) => (
                <section key={id} id={`r-${id}`} aria-labelledby={`r-${id}-h`} className="scroll-mt-28">
                  <h2 id={`r-${id}-h`} tabIndex={-1} className="mb-5 flex items-baseline gap-3 focus:outline-none">
                    <span className="o-readout-strong text-[12px] text-faint">{i + 1}</span>{" "}
                    <span className="o-display text-[26px] leading-tight">{t(`rv.tab.${id}`)}</span>
                  </h2>
                  {SECTION_RENDER[id](data)}
                </section>
              ))}
              <p className="border-t pt-4 text-center text-[13px] font-medium text-faint">{t("rv.endOfReport")}</p>
            </div>
          </div>
        </div>
      </div>
    </ReportMode.Provider>
  );
}

/** The section currently under the reader's eye (for the contents rail and selector). */
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
    // ids are a fixed list
  }, []);
  return active;
}
