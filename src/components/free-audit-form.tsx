"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
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

interface FreeAuditState {
  url: string;
  setUrl: (v: string) => void;
  loading: boolean;
  result: FreeAuditResult | null;
  submit: (e: React.FormEvent) => void;
}

const FreeAuditContext = createContext<FreeAuditState | null>(null);

/**
 * Holds the free-audit state so several inputs (hero + final CTA) share one
 * result, rendered once by <FreeAuditResult/>. Logic and API calls are
 * unchanged from the original single-component form.
 */
export function FreeAuditProvider({ children }: { children: React.ReactNode }) {
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

  return (
    <FreeAuditContext.Provider value={{ url, setUrl, loading, result, submit }}>{children}</FreeAuditContext.Provider>
  );
}

function useFreeAudit(): FreeAuditState {
  const ctx = useContext(FreeAuditContext);
  if (!ctx) throw new Error("FreeAudit components must be inside <FreeAuditProvider>");
  return ctx;
}

/** Sample domains typed into the empty field's placeholder (stops on focus/input). */
const SAMPLE_DOMAINS = ["acme-analytics.com", "launchkit.dev", "fernbooks.io"];

function useTypedPlaceholder(base: string, active: boolean) {
  const [text, setText] = useState(base);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setText(base);
    if (!active || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let word = 0;
    let chars = 0;
    let dir = 1;
    const tick = () => {
      const w = SAMPLE_DOMAINS[word];
      chars += dir;
      let wait = dir > 0 ? 75 : 35;
      if (chars >= w.length) {
        dir = -1;
        wait = 2200;
      } else if (chars <= 0) {
        dir = 1;
        word = (word + 1) % SAMPLE_DOMAINS.length;
        wait = 400;
      }
      setText(w.slice(0, Math.max(chars, 0)) || base);
      timer.current = setTimeout(tick, wait);
    };
    const start = () => (timer.current = setTimeout(tick, 1600));
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) idle(start);
    else start();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [base, active]);
  return text;
}

/** The URL field + submit button. `variant="hero"` is the v2 instrument style. */
export function FreeAuditInput({ variant = "hero", className }: { variant?: "hero" | "cta"; className?: string }) {
  const { t } = useI18n();
  const { url, setUrl, loading, submit } = useFreeAudit();
  const [focused, setFocused] = useState(false);
  const placeholder = useTypedPlaceholder(t("form.placeholder"), variant === "hero" && !focused && !url);

  return (
    <form onSubmit={submit} className={`w-full max-w-xl ${className ?? ""}`} aria-label={t("form.aria")}>
      <div className="flex w-full flex-col gap-2 rounded-2xl border border-line-strong bg-card p-1.5 shadow-[0_0_0_4px_var(--leaf-soft)] transition-[border-color,box-shadow] duration-[var(--dur-state)] focus-within:border-primary/60 focus-within:shadow-[0_0_0_5px_var(--leaf-soft),0_20px_50px_-24px_var(--glow)] min-[480px]:flex-row min-[480px]:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={placeholder}
            className="h-11 border-0 bg-transparent ps-9 font-mono text-[15px] shadow-none placeholder:text-faint focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
            autoComplete="url"
            inputMode="url"
            aria-label={t("form.urlLabel")}
            disabled={loading}
          />
        </div>
        <Button
          type="submit"
          variant={variant === "hero" ? "sheen" : "default"}
          size="xl"
          className="w-full shrink-0 min-[480px]:w-auto"
          disabled={loading}
        >
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
  );
}

/** Original combined form (input + result), kept for any non-v2 caller. */
export function FreeAuditForm() {
  return (
    <FreeAuditProvider>
      <div className="space-y-8">
        <FreeAuditInput variant="cta" />
        <FreeAuditResult />
      </div>
    </FreeAuditProvider>
  );
}

/** The diagnosis card; renders nothing until a scan has completed. */
export function FreeAuditResult() {
  const { t } = useI18n();
  const { result } = useFreeAudit();
  const highImpact = result?.highImpactCount ?? result?.findings.filter((f) => f.severity === "critical" || f.severity === "high").length ?? 0;

  return (
    <>
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
    </>
  );
}
