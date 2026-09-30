"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, FileText, Hourglass, RefreshCw, ScanSearch, Globe } from "lucide-react";
import { ConfettiBurst } from "@/components/confetti";
import { LogoLoader } from "@/components/logo-loader";
import { Enter } from "@/components/motion";
import { getEntitlement, getPlans } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { track } from "@/lib/track";

/**
 * Post-purchase success page — the landing spot Polar redirects to after
 * a completed checkout (`success_url` → /app/checkout/success).
 *
 * The Polar webhook that flips the subscription row usually lands within
 * seconds of the redirect, so the page walks the visitor through it:
 *
 *   confirming → activating (polls entitlement) → celebration
 *                                     └→ delayed fallback after 45s
 *
 * The celebration is one-shot and brand-appropriate: a stroke-drawn check,
 * a petal confetti burst, the receipt, and a clear next step — no looping
 * spectacle. Reduced-motion visitors get the same information with the
 * confetti and draws skipped.
 */

const ACTIVATION_TIMEOUT_MS = 45_000;
const POLL_MS = 3_000;

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Ease-out count-up for the reports-remaining number. */
function useCountUp(target: number, active: boolean, ms = 900) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (reducedMotion()) {
      setN(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, ms]);
  return n;
}

type Phase = "confirming" | "activating" | "success" | "delayed";

export default function CheckoutSuccessPage() {
  const landedAt = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  // Strip Polar's return params (?checkout_id=…&session_id=…) for a clean,
  // shareable URL — they carry nothing the page needs.
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const { data: ent, isLoading, refetch } = useQuery({
    queryKey: ["entitlement"],
    queryFn: getEntitlement,
    // Poll until the purchase is reflected: an active subscription OR a
    // one-time report credit.
    refetchInterval: (query) =>
      query.state.data?.active || (query.state.data?.reportCredits ?? 0) > 0 ? false : POLL_MS,
  });
  const { data: plans } = useQuery({ queryKey: ["plans"], queryFn: getPlans });

  // Wall clock since landing — drives the "delayed" fallback.
  useEffect(() => {
    if (isLoading || ent?.active || (ent?.reportCredits ?? 0) > 0) return;
    const iv = setInterval(() => setElapsed(Date.now() - landedAt.current), 500);
    return () => clearInterval(iv);
  }, [isLoading, ent?.active, ent?.reportCredits]);

  const paid = !!ent && (ent.active || ent.reportCredits > 0);
  const creditOnly = !!ent && !ent.active && ent.reportCredits > 0;
  const phase: Phase = isLoading
    ? "confirming"
    : paid
      ? "success"
      : elapsed < ACTIVATION_TIMEOUT_MS
        ? "activating"
        : "delayed";

  const plan = plans?.find((p) => p.name === ent?.planName) ?? null;
  const oneTimePlan = plans?.find((p) => p.one_time) ?? null;
  // Total analyses available: for credit-only accounts quotaTotal already
  // counts the credits (data.ts) — do not add reportCredits again.
  const totalCount = ent
    ? creditOnly
      ? ent.quotaTotal
      : ent.quotaTotal + ent.reportCredits
    : 0;
  const remaining = ent ? Math.max(0, totalCount - ent.quotaUsed) : 0;
  const counted = useCountUp(remaining, phase === "success");

  // The purchase event — the end of the measured funnel. Fired once.
  const purchaseFired = useRef(false);
  useEffect(() => {
    if (phase === "success" && !purchaseFired.current) {
      purchaseFired.current = true;
      track("purchase", {
        plan: creditOnly ? "Single Report" : (ent?.planName ?? "unknown"),
        one_time: creditOnly,
        ...(creditOnly ? { value: 14, currency: "EUR" } : {}),
      });
      document.title = "Welcome aboard — Marketwise";
    }
  }, [phase, creditOnly, ent?.planName, plan]);

  return (
    <div className="mx-auto flex min-h-[72vh] max-w-2xl flex-col items-center justify-center py-4 text-center">
      <ConfettiBurst fire={phase === "success"} />

      {phase === "confirming" && (
        <div className="flex flex-col items-center gap-4 text-muted-foreground" role="status" aria-live="polite">
          <LogoLoader size={44} glow />
          <p className="text-sm">Confirming your purchase…</p>
        </div>
      )}

      {phase === "activating" && (
        <div className="w-full max-w-sm" role="status" aria-live="polite">
          <div className="mx-auto mb-6 flex flex-col items-center gap-2">
            <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-5" aria-hidden />
            </span>
            <p className="font-display text-2xl font-semibold">Payment received</p>
          </div>
          <ol className="space-y-3 text-start">
            <li className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
              <Check className="size-4 shrink-0 text-primary" aria-hidden />
              <span>Payment confirmed by Polar</span>
            </li>
            <li className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 text-sm">
              <span className="relative flex size-4 shrink-0 items-center justify-center" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-30" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              <span>Unlocking your plan — this usually takes a few seconds.</span>
            </li>
          </ol>
          <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full w-1/3 rounded-full bg-primary animate-progress-sheen" />
          </div>
        </div>
      )}

      {phase === "delayed" && (
        <div className="flex max-w-md flex-col items-center gap-5" role="status" aria-live="polite">
          <span className="inline-flex size-14 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
            <Hourglass className="size-6" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight">Almost there.</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Your payment went through — Polar is finishing the handoff, which can take a minute in rare
              cases. Your plan will appear in Billing the moment it lands. Nothing else is needed from you.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                landedAt.current = Date.now();
                setElapsed(0);
                refetch();
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <RefreshCw className="size-4" aria-hidden /> Refresh status
            </button>
            <Link
              href="/app/billing/"
              className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-5 text-sm font-medium transition-colors hover:bg-accent"
            >
              Open billing
            </Link>
          </div>
        </div>
      )}

      {phase === "success" && (
        <div key="success" className="flex w-full flex-col items-center">
          {/* Check ring */}
          <div className="relative mx-auto mb-6 size-24">
            <div className="check-glow absolute -inset-6 rounded-full" aria-hidden />
            <svg viewBox="0 0 96 96" className="relative size-full text-primary" role="img" aria-label="Purchase confirmed">
              <circle cx="48" cy="48" r="42" fill="none" stroke="currentColor" strokeWidth="3" className="check-ring" />
              <path
                d="M31 50.5 43 62 66 37"
                fill="none"
                stroke="currentColor"
                strokeWidth="5.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="check-mark"
              />
            </svg>
          </div>

          <Enter delay={0.05}>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
              <Check className="size-3" aria-hidden /> Payment confirmed
            </span>
          </Enter>

          <Enter delay={0.12}>
            <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">You&rsquo;re in.</h1>
            <p className="mx-auto mt-3 max-w-md text-balance text-base leading-relaxed text-muted-foreground">
              {creditOnly ? (
                <>
                  Your <span className="font-semibold text-foreground">Single Report</span> credit is ready —
                  one full analysis, no subscription.
                </>
              ) : (
                <>
                  Your <span className="font-semibold text-foreground">{ent?.planName ?? "Marketwise"}</span>{" "}
                  plan is live{plan ? ` — ${plan.price_label}` : ""}. Every report is unlocked and waiting.
                </>
              )}
            </p>
          </Enter>

          {/* Receipt */}
          <Enter delay={0.22} className="mt-8 w-full max-w-md">
            <div className="rounded-xl border bg-card p-5 text-start shadow-sm sm:p-6">
              <dl className="space-y-3 text-sm">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">{creditOnly ? "Purchase" : "Plan"}</dt>
                  <dd className="font-medium">
                    {creditOnly
                      ? `Single Report — ${oneTimePlan?.price_label ?? "one-time"}`
                      : (ent?.planName ?? "—")}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted-foreground">
                    {creditOnly ? "Analyses included" : "Analyses this period"}
                  </dt>
                  <dd className="font-medium">
                    <span className="font-display text-base font-semibold text-primary">{counted}</span>{" "}
                    {creditOnly ? "included" : <>of {totalCount} remaining</>}
                  </dd>
                </div>
                {creditOnly ? (
                  ent?.creditsExpireAt && (
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted-foreground">Credit valid through</dt>
                      <dd className="font-medium">{fmtDate(ent.creditsExpireAt)}</dd>
                    </div>
                  )
                ) : (
                  ent?.renewsAt && (
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted-foreground">Renews</dt>
                      <dd className="font-medium">{fmtDate(ent.renewsAt)}</dd>
                    </div>
                  )
                )}
              </dl>
              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                  style={{
                    width: totalCount > 0 ? `${(remaining / totalCount) * 100}%` : "0%",
                  }}
                />
              </div>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                {creditOnly
                  ? "Your credit stays until you use it. Failed analyses never burn it."
                  : "Failed analyses never count against your quota, and your reports stay in your account even if you cancel."}
              </p>
            </div>
          </Enter>

          <Enter delay={0.3} className="mt-8">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/app/new/"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-7 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                {creditOnly ? "Run your report" : "Run your first analysis"}{" "}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                href="/app/billing/"
                className="inline-flex h-12 items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium transition-colors hover:bg-accent"
              >
                Billing &amp; invoices
              </Link>
            </div>
          </Enter>

          {/* What happens next */}
          <Enter delay={0.4} className="mt-12 w-full">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              What happens next
            </p>
            <div className="mt-4 grid gap-4 text-start sm:grid-cols-3">
              {[
                {
                  icon: Globe,
                  title: "Drop in your website",
                  body: "Any site works — yours, a client's, or a competitor's.",
                },
                {
                  icon: ScanSearch,
                  title: "Watch the audit run",
                  body: "Live steps, real research — about ten minutes, start to finish.",
                },
                {
                  icon: FileText,
                  title: "Read the scored report",
                  body: "Scores, findings, evidence and a 30/60/90-day roadmap.",
                },
              ].map((s, i) => (
                <div key={s.title} className="rounded-xl border bg-card p-4">
                  <div className="flex items-center gap-2.5">
                    <span className="font-display text-lg font-semibold text-primary">0{i + 1}</span>
                    <s.icon className="size-4 text-muted-foreground" aria-hidden />
                  </div>
                  <p className="mt-2 text-sm font-medium">{s.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              ))}
            </div>
            <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
              Receipts and invoices live in your billing portal. Payments, VAT and invoicing are handled by
              Polar, our merchant of record.
            </p>
          </Enter>
        </div>
      )}
    </div>
  );
}
