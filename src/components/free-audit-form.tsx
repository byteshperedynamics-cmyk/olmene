"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Search,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CHECK_COUNT } from "@/lib/config";
import { Input } from "@/components/ui/input";
import { LogoLoader, ShimmerText } from "@/components/logo-loader";
import { runFreeAudit, type FreeAuditResult, type FreeAuditCheck } from "@/lib/api";
import { ScoreRing, ScoreBar } from "@/components/score-ring";
import { severityClass } from "@/lib/format";
import { track } from "@/lib/track";
import { toast } from "sonner";
import { useI18n, Tx } from "@/i18n/provider";
import { SEVERITY_KEYS } from "@/i18n/keys";

function CheckRow({ c }: { c: FreeAuditCheck }) {
  return (
    <li className="flex items-start gap-2 py-1">
      {c.status === "pass" ? (
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 score-good" aria-hidden />
      ) : c.status === "warn" ? (
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 score-mid" aria-hidden />
      ) : (
        <XCircle className="mt-0.5 size-3.5 shrink-0 score-bad" aria-hidden />
      )}
      <span className="min-w-0 text-xs leading-relaxed">
        <span className="font-medium">{c.check}</span>
        <span className="text-muted-foreground"> — {c.detail}</span>
      </span>
    </li>
  );
}

export function FreeAuditForm({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FreeAuditResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error(t("form.toastEmpty"));
      return;
    }
    setLoading(true);
    setResult(null);
    track("audit_start", { site_url: trimmed });
    try {
      const r = await runFreeAudit(trimmed);
      setResult(r);
      track("audit_complete", {
        overall: r.scores.overall,
        passed_checks: r.passedChecks,
        total_checks: r.totalChecks,
        findings: r.findings.length,
      });
      requestAnimationFrame(() =>
        document.getElementById("diagnosis")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("form.toastError"));
    } finally {
      setLoading(false);
    }
  }

  const highImpact = result?.highImpactCount ?? result?.findings.filter((f) => f.severity === "critical" || f.severity === "high").length ?? 0;

  return (
    <div className={compact ? "" : "space-y-8"}>
      <form onSubmit={submit} className="w-full max-w-xl" aria-label={t("form.aria")}>
        <div className="flex w-full flex-col gap-2 rounded-2xl border bg-card p-2 shadow-lg shadow-foreground/[0.04] transition-colors focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10 min-[480px]:flex-row min-[480px]:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("form.placeholder")}
              className="h-10 border-0 bg-transparent ps-9 text-base shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
              autoComplete="url"
              inputMode="url"
              aria-label={t("form.urlLabel")}
              disabled={loading}
            />
          </div>
          <Button type="submit" className="h-10 w-full shrink-0 rounded-xl px-5 text-base min-[480px]:w-auto" disabled={loading}>
            {loading ? (
              <>
                <LogoLoader size={16} /> {t("form.analyzing")}
              </>
            ) : (
              <>
                {t("form.submit")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
              </>
            )}
          </Button>
        </div>
        {loading && (
          <div className="mt-4 flex items-center gap-3" role="status" aria-live="polite">
            <LogoLoader size={22} glow />
            <ShimmerText className="text-sm font-medium">{t("form.reading", { n: CHECK_COUNT })}</ShimmerText>
          </div>
        )}
      </form>

      {result && (
        <div id="diagnosis" className="fade-up-in scroll-mt-24">
          <div className="overflow-hidden rounded-xl border bg-card shadow-lg">
            {/* ── Instrument header: the numbers, straight up ── */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-secondary/40 px-5 py-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("form.instant")}</p>
                <p className="truncate font-mono text-sm">{result.siteUrl}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-background px-3 py-1 font-mono text-xs text-muted-foreground">
                  {t("form.checksPassed", { a: result.passedChecks, b: result.totalChecks })}
                </span>
                <span className="rounded-full bg-background px-3 py-1 font-mono text-xs text-muted-foreground">
                  {highImpact > 0 ? t("form.highImpact", { n: highImpact }) : t("form.noHighImpact")}
                </span>
              </div>
            </div>

            {/* ── Readiness score: deterministic, and it says so ── */}
            <div className="grid gap-6 p-5 sm:grid-cols-[auto_1fr] sm:p-6">
              <div className="flex flex-col items-center gap-4">
                <ScoreRing value={result.scores.overall} size={112} label={t("scores.readiness")} />
              </div>
              <div className="grid gap-3 sm:grid-cols-1">
                <ScoreBar label={t("scores.seoTech")} value={result.scores.seo} />
                <ScoreBar label={t("scores.messaging")} value={result.scores.messaging} />
                <ScoreBar label={t("scores.conversion")} value={result.scores.conversion} />
              </div>
            </div>

            {/* ── Methodology disclosure — the "evidence you can check" contract ── */}
            <div className="border-t bg-secondary/20 px-5 py-3 sm:px-6">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
                  {t("form.howComputed")}
                </summary>
                <div className="mt-2.5 space-y-2.5 text-xs leading-relaxed text-muted-foreground">
                  <p>
                    <Tx k="form.computedBody" vars={{ n: result.totalChecks }} />
                  </p>
                  <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
                    {result.checklist.map((c) => (
                      <CheckRow key={c.check} c={c} />
                    ))}
                  </ul>
                  <p>{t("form.fullReportAdds")}</p>
                </div>
              </details>
            </div>

            {/* ── Findings: fact → labelled hypothesis → fix ── */}
            <div className="space-y-4 px-5 py-5 sm:px-6">
              {result.findings.length > 0 ? (
                <>
                  <p className="text-sm font-semibold">{t("form.found")}</p>
                  <ul className="space-y-3">
                    {result.findings.map((f, i) => (
                      <li key={i} className="rounded-lg border bg-background p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${severityClass(f.severity)}`}>
                            {t(SEVERITY_KEYS[f.severity] ?? f.severity)}
                          </span>
                          <p className="font-medium">{f.title}</p>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">{t("form.evidence")}</span>
                          {f.evidence}
                        </p>
                        {f.impactHypothesis && (
                          <p className="mt-2 rounded-md bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
                              {t("form.impactLabel", { tag: f.impact ? ` · ${f.impact}` : "" })}
                            </span>
                            {f.impactHypothesis}
                          </p>
                        )}
                        <p className="mt-2 text-sm">
                          <span className="font-medium">{t("form.fix")}</span>
                          {f.whatToChange}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 score-good" aria-hidden />
                  {t("form.allPass")}
                </p>
              )}

              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t("common.biggestOpportunity")}</p>
                <p className="mt-1 font-medium">{result.opportunity.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{result.opportunity.why}</p>
              </div>

              {result.hiddenFindings > 0 && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TriangleAlert className="size-4 score-mid" aria-hidden />
                  {t("form.moreFindings", { n: result.hiddenFindings })}
                </p>
              )}
            </div>

            {/* ── Bridge: facts are free, strategy is the product ── */}
            <div className="flex flex-col items-start gap-3 border-t bg-secondary/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="max-w-md text-sm text-muted-foreground">
                <Tx k="form.bridge" />
              </p>
              <Button asChild size="lg" className="shrink-0">
                <Link href="/pricing/">
                  {t("form.unlock")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
