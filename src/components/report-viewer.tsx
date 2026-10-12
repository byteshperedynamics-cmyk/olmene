"use client";

import { useState } from "react";
import { Check, Copy, Download, ExternalLink, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScoreBar, ScoreRing } from "@/components/score-ring";
import { severityClass, statusIconClass, reportToMarkdown, buildActionPlan, realDependency } from "@/lib/format";
import type { ReportData, AuditFinding, SeoCheck, RoadmapAction, ConversionDiff, ConversionDiffField } from "@/lib/report-types";
import { PrintReport } from "@/components/print-report";
import { useI18n } from "@/i18n/provider";
import { SEVERITY_KEYS, STATUS_KEYS, EFFORT_KEYS, IMPACT_KEYS, CONFIDENCE_KEYS, scoreLabelKey } from "@/i18n/keys";

// ── Small building blocks ────────────────────────────────────────────────

function SourceRefs({ ids, sources }: { ids?: string[]; sources: ReportData["sources"] }) {
  if (!ids?.length) return null;
  return (
    <span className="ms-1 font-mono text-xs text-primary">
      {ids.map((id) => {
        const s = sources.find((x) => x.id === id);
        return s ? (
          <a key={id} href={s.url} target="_blank" rel="noopener noreferrer" title={s.title} className="hover:underline">
            [{id}]
          </a>
        ) : (
          <span key={id}>[{id}]</span>
        );
      })}
    </span>
  );
}

function FindingCard({ f, sources }: { f: AuditFinding; sources: ReportData["sources"] }) {
  const { t } = useI18n();
  return (
    <div className="rounded-lg border bg-background p-4 print-block">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${severityClass(f.severity)}`}>
          {t(SEVERITY_KEYS[f.severity] ?? f.severity)}
        </span>
        <p className="font-medium">{f.title}</p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">{t("rv.evidence")}</span>
        {f.evidence}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed">
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
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
          c.status === "pass" ? "sev-pass" : c.status === "warn" ? "sev-warn" : "sev-fail"
        }`}
      >
        {t(STATUS_KEYS[c.status] ?? c.status)}
      </span>
    </div>
  );
}

// ── Section renderers ───────────────────────────────────────────────────

const COPY_KIND_LABEL: Record<ConversionDiffField["kind"], string> = {
  h1: "Headline",
  subheadline: "Subheadline",
  cta: "CTA button",
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
        <div key={f.kind} className="rounded-lg border bg-background p-4 print-block">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              {COPY_KIND_LABEL[f.kind]}
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
              <span className="me-1.5 inline-block w-12 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-primary">{t("rv.copyAfter")}</span>
              <span className="font-medium">{f.after}</span>
            </p>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{t("rv.copyWhy")}</span>{" "}
            {f.rationale}
          </p>
          <div className="mt-3 overflow-hidden rounded-md border bg-surface-2/60" dir="ltr">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">HTML</span>
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
      <div className="grid items-center gap-8 rounded-xl border bg-background p-6 sm:grid-cols-[auto_1fr] print-block">
        <ScoreRing value={s.overall} size={128} label={`${t(scoreLabelKey(s.overall))} · ${t("scores.of100")}`} />
        <div className="grid gap-3">
          <ScoreBar label={t("scores.messagingShort")} value={s.messaging} />
          <ScoreBar label={t("scores.positioning")} value={s.positioning} />
          <ScoreBar label={t("scores.conversionShort")} value={s.conversion} />
          <ScoreBar label={t("scores.seoShort")} value={s.seo} />
          <ScoreBar label={t("scores.trust")} value={s.trust} />
        </div>
      </div>
      <p className="font-display text-xl font-semibold leading-snug text-balance">{r.executiveSummary.headline}</p>
      <div>
        <h3 className="font-display text-lg font-semibold">{t("rv.topFindings")}</h3>
        <ul className="mt-3 space-y-2.5">
          {r.executiveSummary.topFindings.map((f, i) => (
            <li key={i} className="flex items-start gap-2.5 leading-relaxed">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-5 print-block">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("common.biggestOpportunity")}</p>
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
        <div className="rounded-xl border bg-background p-5 print-block">
          <h3 className="font-semibold">{t("rv.offerings")}</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {p.offerings.map((o, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" aria-hidden />{o}</li>)}
          </ul>
        </div>
        <div className="rounded-xl border bg-background p-5 print-block">
          <h3 className="font-semibold">{t("rv.pricingModel")}</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{p.pricingModel}</p>
        </div>
      </div>
      <div>
        <h3 className="font-semibold">{t("rv.targetCustomers")}</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {p.targetCustomers.map((tc, i) => (
            <span key={i} className="rounded-full border bg-background px-3 py-1 text-sm text-muted-foreground">{tc}</span>
          ))}
        </div>
      </div>
      <div>
        <h3 className="font-semibold">{t("rv.valueProps")}</h3>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {p.valueProps.map((v, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" aria-hidden />{v}</li>)}
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
      <div className="grid gap-4 rounded-xl border bg-background p-5 sm:grid-cols-3 print-block">
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("rv.marketSize")}</p>
          <p className="mt-1 font-display text-xl font-bold">{m.size.value}</p>
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
            <div key={i} className="rounded-lg border bg-background p-4 print-block">
              <p className="font-medium">{tr.trend}<SourceRefs ids={tr.sourceIds} sources={r.sources} /></p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{tr.implication}</p>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold">{t("rv.segments")}</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {m.segments.map((s, i) => (
            <div key={i} className="rounded-lg border bg-background p-4 print-block">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium">{s.name}</p>
                <span className="font-mono text-sm text-primary">{t("rv.fit", { n: s.fitScore })}</span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.why}</p>
              <p className="mt-1.5 text-sm"><span className="font-medium">{t("rv.reach")}</span><span className="text-muted-foreground">{s.howToReach}</span></p>
            </div>
          ))}
        </div>
      </div>
      <p className="rounded-lg border bg-secondary/50 p-4 leading-relaxed print-block">{m.potentialAssessment}</p>
    </div>
  );
}

export function CompetitorsSection({ r }: { r: ReportData }) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      {r.competitors.map((c, i) => (
        <div key={i} className="rounded-xl border bg-background p-5 print-block">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="font-display text-lg font-semibold">{c.name}</p>
              <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                <ExternalLink className="size-3" aria-hidden />{new URL(c.url).hostname}
              </a>
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
          <p className="mt-4 rounded-lg bg-primary/5 p-3 text-sm leading-relaxed">
            <span className="font-semibold text-primary">{t("rv.gap")}</span>
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
        <div className="mt-3 rounded-xl border bg-background px-4 print-block">
          {a.seo.checklist.map((c, i) => <SeoCheckRow key={i} c={c} />)}
        </div>
      </div>
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
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 print-block">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("rv.positioning")}</p>
        <p className="mt-2 font-display text-lg font-semibold leading-snug">{s.positioning.statement}</p>
      </div>
      <div>
        <h3 className="font-semibold">{t("rv.differentiators")}</h3>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {s.positioning.differentiators.map((d, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" aria-hidden />{d}</li>)}
        </ul>
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold">{t("rv.icp")}</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {s.icp.map((i, j) => (
            <div key={j} className="rounded-lg border bg-background p-4 print-block">
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
              <div key={i} className="rounded-lg border bg-background p-4 print-block">
                <div className="flex items-baseline gap-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-xs font-bold text-primary">{c.priority}</span>
                  <p className="font-medium">{c.channel}</p>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">{c.rationale}</p>
                {c.firstSteps?.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {c.firstSteps.map((f, k) => <li key={k} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" aria-hidden />{f}</li>)}
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
            {s.offerAndPricingIdeas.map((o, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" aria-hidden />{o}</li>)}
          </ul>
        </div>
      ) : null}
      {s.contentThemes?.length ? (
        <div>
          <h3 className="font-display text-lg font-semibold">{t("rv.contentThemes")}</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {s.contentThemes.map((ct, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" aria-hidden />{ct}</li>)}
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
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 font-display text-sm font-bold text-primary">
              {days}
            </span>
            <h3 className="font-display text-lg font-semibold">{label}</h3>
            <span className="text-sm text-muted-foreground">({t("rv.actionCount", { n: items.length })})</span>
          </div>
          <div className="mt-3 space-y-3">
            {items.map((a, i) => (
              <div key={i} className="rounded-lg border bg-background p-4 print-block">
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
        <div key={i} className="rounded-lg border bg-background p-4 print-block">
          <p className="font-medium">{k.risk}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground"><span className="font-medium text-foreground">{t("rv.mitigation")}</span>{k.mitigation}</p>
        </div>
      ))}
      <div className="rounded-lg border bg-secondary/50 p-4 print-block">
        <h3 className="font-semibold">{t("rv.assumptions")}</h3>
        <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
          {r.assumptions.map((a, i) => <li key={i} className="flex gap-2"><span className="mt-1.5 size-1 shrink-0 rounded-full bg-primary" aria-hidden />{a}</li>)}
        </ul>
      </div>
    </div>
  );
}

export function SourcesSection({ r }: { r: ReportData }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{t("rv.sourcesNote")}</p>
      <ol className="space-y-2">
        {r.sources.map((s) => (
          <li key={s.id} className="flex items-start gap-3 rounded-lg border bg-background p-3 print-block">
            <span className="font-mono text-sm font-semibold text-primary">{s.id}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{s.title}</p>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 block truncate text-xs text-muted-foreground hover:text-primary">
                {s.url}
              </a>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Main viewer ─────────────────────────────────────────────────────────

export function ReportViewer({ data }: { data: ReportData }) {
  const { t, lang } = useI18n();
  const [copied, setCopied] = useState(false);
  const locale = lang === "en" ? undefined : lang;
  const date = new Date(data.meta.generatedAt).toLocaleDateString(locale ?? undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  function exportMarkdown() {
    const md = reportToMarkdown(data);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.product.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-marketing-report.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(t("rv.toastExported"));
  }

  async function copyActionPlan() {
    try {
      await navigator.clipboard.writeText(buildActionPlan(data));
      setCopied(true);
      toast.success(t("rv.toastCopied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("rv.toastCopyFail"));
    }
  }

  const TABS = [
    ["summary", t("rv.tab.summary")],
    ["product", t("rv.tab.product")],
    ["market", t("rv.tab.market")],
    ["competitors", t("rv.tab.competitors")],
    ["audit", t("rv.tab.audit")],
    ["strategy", t("rv.tab.strategy")],
    ["roadmap", t("rv.tab.roadmap")],
    ["risks", t("rv.tab.risks")],
    ["sources", t("rv.tab.sources")],
  ] as const;

  return (
    <div>
      {/* Premium print/PDF face — replaces the interactive viewer on paper */}
      <div className="hidden print:block">
        <PrintReport data={data} />
      </div>

      <div className="print:hidden">
      {/* Toolbar */}
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {data.meta.siteUrl} · {t("rv.generated", { date })}
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

      <p className="mb-6 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground print-block">
        {t("rv.aiNote")}
      </p>

      <Tabs defaultValue="summary">
        <TabsList className="no-print mb-6 flex h-auto w-full flex-wrap justify-start gap-1">
          {TABS.map(([id, label]) => (
            <TabsTrigger key={id} value={id} className="text-sm">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="summary"><SummarySection r={data} /></TabsContent>
        <TabsContent value="product"><ProductSection r={data} /></TabsContent>
        <TabsContent value="market"><MarketSection r={data} /></TabsContent>
        <TabsContent value="competitors"><CompetitorsSection r={data} /></TabsContent>
        <TabsContent value="audit"><AuditSection r={data} /></TabsContent>
        <TabsContent value="strategy"><StrategySection r={data} /></TabsContent>
        <TabsContent value="roadmap"><RoadmapSection r={data} /></TabsContent>
        <TabsContent value="risks"><RisksSection r={data} /></TabsContent>
        <TabsContent value="sources"><SourcesSection r={data} /></TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
