"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Info,
  ListChecks,
  RotateCcw,
  Search,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CHECK_COUNT } from "@/lib/config";
import { Input } from "@/components/ui/input";
import { LogoLoader, ShimmerText } from "@/components/logo-loader";
import { ApiRequestError, getFreeAudit, runFreeAudit, streamFreeAudit, type FreeAuditCategory, type FreeAuditCheck, type FreeAuditExtra, type FreeAuditPlatform, type FreeAuditProposals, type FreeAuditResult, type FreeAuditShot } from "@/lib/api";
import { ScoreRing, ScoreBar } from "@/components/score-ring";
import { CategoryBadge, PreviewCards, ProposalsPanel, ShotPanel } from "@/components/free-scan-v2";
import { severityClass } from "@/lib/format";
import { track } from "@/lib/track";
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

/** Display order for the unscored extra-check groups (matches the engine's set). */
const EXTRA_GROUPS = ["AI search", "Performance", "Security", "SEO", "Social", "Business"] as const;

type Origin = "hero" | "cta";

/** Live scan events from the streaming endpoint (engine v2) — drives the honest progress UI. */
export interface ScanLiveProgress {
  siteUrl?: string;
  platform?: FreeAuditPlatform;
  rendering: boolean;
  checklist: FreeAuditCheck[];
  scores?: FreeAuditResult["scores"];
  category?: FreeAuditCategory;
  extras: FreeAuditExtra[];
}

interface FreeAuditState {
  url: string;
  setUrl: (v: string) => void;
  loading: boolean;
  result: FreeAuditResult | null;
  /** Stream events as they arrive; null when not scanning (or on the non-streaming fallback). */
  progress: ScanLiveProgress | null;
  /** Inline error for the last scan (stays until the next attempt). */
  error: string | null;
  /** Which input started the scan — progress and errors render under it. */
  origin: Origin;
  submit: (e: React.FormEvent, origin?: Origin) => void;
}

const FreeAuditContext = createContext<FreeAuditState | null>(null);

const EMPTY_PROGRESS: ScanLiveProgress = { rendering: false, checklist: [], extras: [] };

/**
 * Holds the free-audit state so several inputs (hero + final CTA) share one
 * result, rendered once by <FreeAuditResult/>.
 */
export function FreeAuditProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FreeAuditResult | null>(null);
  const [progress, setProgress] = useState<ScanLiveProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState<Origin>("hero");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (pollRef.current) clearTimeout(pollRef.current);
  }, []);

  /** The screenshot lags the result ("shot" may follow "done"): poll the saved scan a couple of times. */
  function pollShot(scanId: string, attempt: number) {
    pollRef.current = setTimeout(async () => {
      try {
        const r = await getFreeAudit(scanId);
        if (r.shot && r.shot.status !== "pending") {
          setResult((prev) => (prev && prev.scanId === scanId ? { ...prev, shot: r.shot } : prev));
          return;
        }
        if (attempt < 3) pollShot(scanId, attempt + 1);
      } catch {
        /* the scan result stands on its own without the screenshot */
      }
    }, attempt === 0 ? 4000 : 8000);
  }

  async function submit(e: React.FormEvent, from: Origin = "hero") {
    e.preventDefault();
    if (loading) return;
    setOrigin(from);
    const trimmed = url.trim();
    if (!trimmed) {
      setError(t("form.toastEmpty"));
      return;
    }
    setLoading(true);
    setResult(null);
    setProgress(EMPTY_PROGRESS);
    setError(null);
    track("audit_start", { site_url: trimmed });
    try {
      // Streaming first (real milestones as they happen); runFreeAudit stays
      // the fallback for browsers without ReadableStream.
      let r: FreeAuditResult;
      if (typeof ReadableStream !== "undefined") {
        r = await streamFreeAudit(trimmed, (ev) => {
          setProgress((prev) => {
            const p = prev ?? EMPTY_PROGRESS;
            switch (ev.type) {
              case "start":
                return { ...p, siteUrl: ev.url };
              case "page":
                return { ...p, siteUrl: ev.siteUrl, platform: ev.platform };
              case "rendering":
                return { ...p, rendering: true };
              case "checklist":
                return { ...p, checklist: ev.checklist };
              case "scores":
                return { ...p, scores: ev.scores };
              case "category":
                return { ...p, category: ev.category };
              case "extra":
                return { ...p, extras: [...p.extras, ev.check] };
              default:
                return p;
            }
          });
        });
      } else {
        r = await runFreeAudit(trimmed);
      }
      setResult(r);
      setProgress(null);
      if (r.scanId) sessionStorage.setItem("olmene.scanId", r.scanId);
      if (r.shot?.status === "pending" && r.scanId) pollShot(r.scanId, 0);
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
      // Server errors carry a readable reason ("couldn't reach that site");
      // network failures don't, so they get the translated fallback.
      const msg = err instanceof ApiRequestError ? err.message : t("form.toastError");
      setError(msg);
      setProgress(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <FreeAuditContext.Provider value={{ url, setUrl, loading, result, progress, error, origin, submit }}>{children}</FreeAuditContext.Provider>
  );
}

function useFreeAudit(): FreeAuditState {
  const ctx = useContext(FreeAuditContext);
  if (!ctx) throw new Error("FreeAudit components must be inside <FreeAuditProvider>");
  return ctx;
}

/** Sample domains typed into the empty field's placeholder (stops on focus/input). */
const SAMPLE_DOMAINS = ["acme-analytics.com", "launchkit.dev", "fernbooks.io"];

/** A real site the sample chip types in (acme-analytics.com in the illustrations doesn't exist). */
const SAMPLE_SITE = "olmene.com";

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
  const { url, setUrl, loading, progress, error, origin, submit } = useFreeAudit();
  const mine = origin === variant;
  const [focused, setFocused] = useState(false);
  const [typing, setTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const placeholder = useTypedPlaceholder(t("form.placeholder"), variant === "hero" && !focused && !url && !typing);

  // "Try it on olmene.com": types a real, scannable URL into the command bar
  // (a sample that exists, so the scan that follows works). The visitor still
  // presses Scan; nothing is submitted for them.
  const trySample = () => {
    const sample = SAMPLE_SITE;
    if (loading || typing) return;
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setUrl(sample);
      inputRef.current?.focus();
      return;
    }
    setTyping(true);
    setUrl("");
    let i = 0;
    const tick = () => {
      i += 1;
      setUrl(sample.slice(0, i));
      if (i < sample.length) window.setTimeout(tick, 42 + Math.random() * 38);
      else {
        setTyping(false);
        inputRef.current?.focus();
      }
    };
    window.setTimeout(tick, 120);
  };

  return (
    <form onSubmit={(e) => submit(e, variant)} className={`w-full max-w-xl ${className ?? ""}`} aria-label={t("form.aria")}>
      <div className="o-beam-border flex w-full flex-col gap-2 rounded-2xl p-1.5 shadow-[inset_0_1px_0_var(--edge-top),0_18px_44px_-22px_rgb(0_0_0/0.8)] min-[480px]:flex-row min-[480px]:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <Input
            ref={inputRef}
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
        <Button type="submit" size="xl" className="w-full shrink-0 min-[480px]:w-auto" disabled={loading || typing}>
          {loading ? (
            <>
              <LogoLoader size={16} className="text-primary-foreground" /> {t("form.analyzing")}
            </>
          ) : (
            <>
              {t("form.submit")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
            </>
          )}
        </Button>
      </div>
      {variant === "hero" && !loading && (
        <button
          type="button"
          onClick={trySample}
          className="o-chip mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] text-muted-foreground transition-colors duration-[var(--dur-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="text-faint">{t("hero.trySample")}</span>
          <span dir="ltr" className="font-mono text-foreground">{SAMPLE_SITE}</span>
        </button>
      )}
      {loading && mine && <ScanProgress progress={progress ?? EMPTY_PROGRESS} />}
      {!loading && error && mine && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-3 rounded-xl border border-signal-rust/35 bg-signal-rust/[0.06] px-3.5 py-3 text-start text-sm fade-up-in"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-signal-rust" aria-hidden />
          <p className="min-w-0 flex-1 leading-relaxed">
            <span className="font-medium">{t("form.errorTitle")}</span> <span className="text-muted-foreground">{error}</span>
          </p>
          {url.trim() && (
            <button
              type="submit"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <RotateCcw className="size-3.5" aria-hidden /> {t("form.retry")}
            </button>
          )}
        </div>
      )}
    </form>
  );
}

/**
 * Live scan progress from the streaming events (engine v2). Every line
 * reflects something that actually happened: the platform detection, the
 * browser rendering, checks as they land, the score. The bar stays
 * asymptotic — it never claims 100% before the result.
 */
function ScanProgress({ progress }: { progress: ScanLiveProgress }) {
  const { t } = useI18n();
  const events = progress.checklist.length + progress.extras.length + (progress.scores ? 1 : 0) + (progress.category ? 1 : 0) + (progress.platform ? 1 : 0);
  const pct = Math.min(92, 100 * (1 - Math.exp(-events / 22)));
  const recentChecks = progress.checklist.slice(-3);
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-line-strong bg-card/80 text-start fade-up-in" role="status" aria-live="polite">
      <div className="h-0.5 bg-surface-2">
        <div
          className="h-full origin-[left] bg-primary shadow-[0_0_10px_var(--glow)] transition-transform duration-300 ease-out rtl:origin-[right]"
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3.5 pt-3">
        <LogoLoader size={18} glow />
        <ShimmerText className="text-[13px] font-medium">{t("form.reading", { n: CHECK_COUNT })}</ShimmerText>
        {progress.platform && progress.platform.id !== "unknown" && (
          <span className="rounded-full border border-line-strong bg-background px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground">
            {progress.platform.label}
          </span>
        )}
      </div>
      <ol className="grid gap-1 px-3.5 pb-3.5 pt-2.5 font-mono text-[12px]">
        {progress.platform && (
          <li className="flex items-center gap-2.5 text-muted-foreground">
            <Check className="size-3.5 shrink-0 text-tel-emerald" strokeWidth={3} aria-hidden />
            {t("form.progressPlatform", { label: progress.platform.label })}
          </li>
        )}
        {progress.rendering && (
          <li className="flex items-center gap-2.5 text-foreground">
            <span className="o-pulse-dot size-1.5 shrink-0 rounded-full" aria-hidden />
            {t("form.progressRendering")}
          </li>
        )}
        {progress.scores && (
          <li className="flex items-center gap-2.5 text-muted-foreground">
            <Check className="size-3.5 shrink-0 text-tel-emerald" strokeWidth={3} aria-hidden />
            {t("form.progressScored", { overall: progress.scores.overall })}
          </li>
        )}
        {progress.category && (
          <li className="flex items-center gap-2.5 text-muted-foreground">
            <Check className="size-3.5 shrink-0 text-tel-emerald" strokeWidth={3} aria-hidden />
            {progress.category.label}
          </li>
        )}
        {recentChecks.map((c) => (
          <li key={c.check} className="flex items-center gap-2.5 text-muted-foreground">
            {c.status === "pass" ? (
              <Check className="size-3.5 shrink-0 text-tel-emerald" strokeWidth={3} aria-hidden />
            ) : c.status === "warn" ? (
              <TriangleAlert className="size-3.5 shrink-0 score-mid" aria-hidden />
            ) : (
              <XCircle className="size-3.5 shrink-0 score-bad" aria-hidden />
            )}
            <span className="min-w-0 truncate">{c.check}</span>
          </li>
        ))}
        {progress.extras.length > 0 && (
          <li className="flex items-center gap-2.5 text-faint">
            <ListChecks className="size-3.5 shrink-0" aria-hidden />
            {t("form.progressExtras", { n: progress.extras.length })}
          </li>
        )}
      </ol>
    </div>
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
  const [proposals, setProposals] = useState<FreeAuditProposals | null>(null);
  const highImpact = result?.highImpactCount ?? result?.findings.filter((f) => f.severity === "critical" || f.severity === "high").length ?? 0;
  // Main-button routing (engine v2 fixModes, falling back to v1 `fixable`):
  // PR-fixable → the agent preview from the saved scan; api → guided run with
  // the connect flow (Olmene applies on the platform); guided → the step-by-
  // step run. The report stays the fallback for unsaved scans.
  const modes = result?.platform?.fixModes;
  const v1Fixable = result?.platform?.fixable ?? "unknown";
  const prMode = (modes ? modes.includes("pr") : v1Fixable === "yes" || v1Fixable === "partial") && !!result?.scanId;
  const apiMode = !prMode && !!result?.scanId && (modes?.includes("api") ?? false);
  const guidedMode = !prMode && !apiMode && !!result?.scanId && (modes?.includes("guided") ?? false);
  const platformNote = result?.platform?.note ?? null;

  return (
    <>
      {result && (
        <div id="diagnosis" className="fade-up-in scroll-mt-24">
          <div className="o-elevated relative overflow-hidden rounded-2xl border border-line-strong bg-card">
            {/* One-shot scan line across the card as the result lands */}
            <div aria-hidden className="o-anim o-diff-sweep pointer-events-none absolute inset-x-0 top-0 h-px" />
            {/* ── Instrument header: the numbers, straight up ── */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-strong bg-surface-2/50 px-5 py-3.5">
              <div className="min-w-0">
                <p className="o-eyebrow">{t("form.instant")}</p>
                <p className="mt-0.5 truncate font-mono text-sm" dir="ltr">{result.siteUrl}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {result.cached && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-background px-3 py-1 font-mono text-xs text-muted-foreground"
                    title={t("form.cachedBadge")}
                  >
                    <Clock className="size-3" aria-hidden /> {t("form.cachedBadge")}
                  </span>
                )}
                {result.category && <CategoryBadge category={result.category} />}
                {result.platform && result.platform.id !== "unknown" && (
                  <span className="rounded-full border border-line-strong bg-background px-3 py-1 font-mono text-xs text-muted-foreground">
                    {result.platform.label}
                  </span>
                )}
                <span className="rounded-full border border-line-strong bg-background px-3 py-1 font-mono text-xs text-muted-foreground">
                  {t("form.checksPassed", { a: result.passedChecks, b: result.totalChecks })}
                </span>
                <span
                  className={`rounded-full border px-3 py-1 font-mono text-xs ${
                    highImpact > 0 ? "border-signal-rust/35 bg-signal-rust/[0.06] text-signal-rust" : "border-tel-emerald/35 bg-tel-emerald/[0.06] text-tel-emerald"
                  }`}
                >
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

            {/* ── JS-shell pages: the score says less than usual, and it says so ── */}
            {result.contentMeasured === false && (
              <div className="mx-5 mb-5 flex items-start gap-3 rounded-xl border border-signal-amber/40 bg-signal-amber/[0.06] px-4 py-3.5 sm:mx-6">
                <Info className="mt-0.5 size-4 shrink-0 text-signal-amber" aria-hidden />
                <p className="text-sm leading-relaxed">
                  <span className="font-medium">{t("form.contentNotMeasuredTitle")}</span>{" "}
                  <span className="text-muted-foreground">{t("form.contentNotMeasuredBody")}</span>
                </p>
              </div>
            )}

            {/* ── How you show up: Google result + shared-link card, with the proposed after-state ── */}
            {result.preview && (
              <div className="border-t border-line-strong px-5 py-5 sm:px-6">
                <p className="text-sm font-semibold">{t("form.previewTitle")}</p>
                <p className="mb-4 mt-1 text-[13px] text-muted-foreground">{t("form.previewBody")}</p>
                <PreviewCards preview={result.preview} after={proposals?.previewAfter ?? null} />
                {result.scanId && (
                  <div className="mt-4">
                    <ProposalsPanel scanId={result.scanId} onProposals={setProposals} />
                  </div>
                )}
              </div>
            )}

            {/* ── The first screen, annotated — the pins are the findings ── */}
            {result.shot && result.shot.status !== "unavailable" && (
              <div className="border-t border-line-strong bg-surface-2/30 px-5 py-5 sm:px-6">
                <p className="mb-4 text-sm font-semibold">{t("form.shotTitle")}</p>
                <ShotPanel shot={result.shot} />
              </div>
            )}

            {/* ── Methodology disclosure — the "evidence you can check" contract ── */}
            <div className="border-t border-line-strong bg-surface-2/30 px-5 py-3 sm:px-6">
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

            {/* ── Extras: real checks, deliberately outside the score ── */}
            {result.extras && result.extras.length > 0 && (
              <div className="border-t border-line-strong bg-surface-2/30 px-5 py-3 sm:px-6">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                    <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
                    {t("form.extrasTitle")}
                  </summary>
                  <p className="mt-2.5 text-xs text-muted-foreground">
                    <Tx k="form.extrasBody" vars={{ n: result.totalChecks }} />
                  </p>
                  <div className="mt-3 grid gap-x-8 gap-y-4 pb-1.5 sm:grid-cols-2">
                    {EXTRA_GROUPS.map((group) => {
                      const rows = result.extras!.filter((e) => e.group === group);
                      if (rows.length === 0) return null;
                      return (
                        <div key={group}>
                          <p className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">{group}</p>
                          <ul>
                            {rows.map((e) => (
                              <CheckRow key={e.id} c={e} />
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </details>
              </div>
            )}

            {/* ── Findings: fact → labelled hypothesis → fix ── */}
            <div className="space-y-4 px-5 py-5 sm:px-6">
              {result.findings.length > 0 ? (
                <>
                  <p className="text-sm font-semibold">{t("form.found")}</p>
                  <ul className="space-y-3">
                    {result.findings.map((f, i) => (
                      <li key={i} className="rounded-xl border border-line-strong bg-background p-4">
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

              <div className="o-artifact rounded-xl p-4">
                <p className="o-eyebrow">{t("common.biggestOpportunity")}</p>
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

            {/* ── Bridge: routed by how this site can actually be fixed ── */}
            <div className="flex flex-col items-start gap-3 border-t border-line-strong bg-surface-2/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              {prMode ? (
                <div className="max-w-md">
                  <p className="text-sm text-muted-foreground">
                    <Tx k="form.bridge" />
                  </p>
                  {platformNote && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{platformNote}</p>}
                </div>
              ) : (
                /* Guided / API modes don't open pull requests — the engine's
                   note says exactly what happens instead, so it leads. */
                <p className="max-w-md text-sm text-muted-foreground">{platformNote}</p>
              )}
              {prMode ? (
                /* Fixable here: the scan is saved and travels to the agent hub. */
                <Button asChild variant="sheen" size="lg" className="shrink-0">
                  <Link href={`/app/agent/?scan=${result.scanId}`}>
                    {t("form.previewFix")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
                  </Link>
                </Button>
              ) : apiMode ? (
                /* Connected platform: Olmene applies the approved fixes for you. */
                <Button asChild variant="sheen" size="lg" className="shrink-0">
                  <Link href={`/app/agent/guided/?scan=${result.scanId}&connect=1`}>
                    {t("form.fixApi")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
                  </Link>
                </Button>
              ) : guidedMode ? (
                /* Everything else: step-by-step fixes for this platform. */
                <Button asChild variant="sheen" size="lg" className="shrink-0">
                  <Link href={`/app/agent/guided/?scan=${result.scanId}`}>
                    {t("form.fixGuided")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
                  </Link>
                </Button>
              ) : v1Fixable === "no" ? (
                <Button asChild variant="sheen" size="lg" className="shrink-0">
                  <Link href="/pricing/">
                    {t("form.getReport")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
                  </Link>
                </Button>
              ) : (
                /* Nothing to fix → the next useful step is the full report, not "fix these". */
                <Button asChild variant="sheen" size="lg" className="shrink-0">
                  <Link href={result.findings.length > 0 ? "/pricing/" : "/sample-report/"}>
                    {result.findings.length > 0 ? t("form.unlock") : t("teardown.paidLayerLink")}{" "}
                    <ArrowRight className="size-4 rtl-flip" aria-hidden />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
