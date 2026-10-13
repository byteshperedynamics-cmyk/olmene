"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, GitPullRequest, RotateCcw } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { SAMPLE_DIFF } from "@/lib/v2/sample-data";
import { ExampleBadge, LivePill, ProductFrame } from "../atoms";
import { DiffView } from "../diff-view";
import { Flower } from "../flower";
import { StepRail, type RailStep } from "../step-rail";
import { Section, SectionHeader } from "./section";

type Phase = "review" | "opening" | "verifying" | "declined";

/**
 * The agent's review screen as a playable demo (EXAMPLE job, marked as such).
 * File tabs switch the diff; "Approve 2 changes" runs the next steps the real
 * agent takes: the pull request opens, then the live check starts. "Decline
 * all" shows that nothing changes. A reset replays it. Nothing is sent
 * anywhere: this is a local simulation of the real screen.
 */
export function ReviewShowcase() {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("review");
  const [ripple, setRipple] = useState<{ x: number; y: number; k: number } | null>(null);
  const timers = useRef<number[]>([]);
  const changes = [
    { label: t("review.c1"), impact: "high" as const },
    { label: t("review.c2"), impact: "high" as const },
  ];

  useEffect(() => () => timers.current.forEach((x) => window.clearTimeout(x)), []);

  const approve = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setRipple({ x: e.clientX - r.left, y: e.clientY - r.top, k: Date.now() });
    setPhase("opening");
    timers.current.push(window.setTimeout(() => setPhase("verifying"), 1100));
  };
  const reset = () => {
    timers.current.forEach((x) => window.clearTimeout(x));
    timers.current = [];
    setRipple(null);
    setPhase("review");
  };

  const reviewDone = phase === "opening" || phase === "verifying";
  const steps: RailStep[] = [
    { key: "plan", label: t("agent.step.plan"), state: "done", meta: "0:11" },
    { key: "draft", label: t("agent.step.draft"), state: "done", meta: "0:38" },
    { key: "review", label: t("agent.step.review"), state: reviewDone ? "done" : phase === "declined" ? "failed" : "now", meta: reviewDone ? "1:02" : undefined },
    { key: "pr", label: t("agent.step.pr"), state: phase === "verifying" ? "done" : phase === "opening" ? "now" : "pending", meta: phase === "verifying" ? "1:04" : undefined },
    { key: "verify", label: t("agent.step.verify"), state: phase === "verifying" ? "now" : "pending" },
  ];

  return (
    <Section className="border-y border-edge" innerClassName="grid gap-12">
      <div className="grid min-w-0 gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
        <SectionHeader eyebrow={t("review.label")} title={t("review.title")} lede={t("review.body")} />
        <ul className="grid gap-3 text-[15px] lg:pb-1">
          {["review.li1", "review.li2", "review.li3"].map((k) => (
            <li key={k} className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
              <span>{t(k)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="min-w-0">
        <ProductFrame url="olmene.com/app/agent/job/7f3a" badge={<ExampleBadge label={t("common.example")} />}>
          <div className="grid gap-4 p-4 sm:p-6 md:grid-cols-[240px_minmax(0,1fr)]">
            <div className="o-well min-w-0 rounded-xl p-4">
              <div className="mb-3 flex items-center gap-2.5 border-b border-edge pb-3">
                <Flower size={24} variant={phase === "review" || phase === "opening" ? "breathe" : "static"} />
                <div className="min-w-0">
                  <div aria-live="polite">
                    {phase === "review" && (
                      <LivePill tone="example" className="min-w-0 max-w-full gap-1.5">
                        <span className="size-1.5 animate-[soft-pulse_1.6s_ease-in-out_infinite] rounded-full bg-tel-amber o-anim" aria-hidden />
                        <span className="truncate">{t("review.status")}</span>
                      </LivePill>
                    )}
                    {phase === "opening" && <LivePill tone="neutral">{t("agent.step.pr")}…</LivePill>}
                    {phase === "verifying" && (
                      <LivePill tone="live" className="min-w-0 max-w-full shadow-[0_0_18px_-4px_var(--tel-emerald)]">
                        <GitPullRequest className="size-3 shrink-0" aria-hidden /> <span className="truncate">{t("review.prOpened", { pr: "#14" })}</span>
                      </LivePill>
                    )}
                    {phase === "declined" && <LivePill tone="neutral">{t("review.declined")}</LivePill>}
                  </div>
                  <p className="mt-1.5 truncate font-mono text-[10.5px] text-tel-sky" dir="ltr">
                    {phase === "verifying" ? "olmene/fix-7f3a → main" : "acme/site · main"}
                  </p>
                </div>
              </div>
              <StepRail steps={steps} className="hidden md:grid" />
              <StepRail steps={steps} orientation="horizontal" className="md:hidden" />
            </div>

            <div className="grid min-w-0 content-start gap-3">
              <DiffView files={SAMPLE_DIFF} newFileLabel={t("diff.newFile")} animate={false} />
              <div className="o-well overflow-hidden rounded-xl">
                {changes.map((c) => (
                  <div key={c.label} className="flex flex-wrap items-center gap-2.5 border-b border-edge px-3.5 py-2.5 text-[13px] last:border-b-0">
                    <span
                      className={`grid size-4 shrink-0 place-items-center rounded transition-colors duration-[var(--dur-state)] ${
                        phase === "declined" ? "border border-rim" : "bg-foreground text-background"
                      }`}
                      aria-hidden
                    >
                      {phase !== "declined" && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 leading-snug">{c.label}</span>{" "}
                    <LivePill tone={c.impact === "high" ? "problem" : "neutral"}>
                      {t(c.impact === "high" ? "review.impact.high" : "review.impact.medium")}
                    </LivePill>
                  </div>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge px-3.5 py-3">
                  <p className="min-w-0 text-[12px] text-muted-foreground">
                    {t("review.branchNote", { branch: "olmene/fix-7f3a" })}
                  </p>
                  {phase === "review" ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPhase("declined")}
                        className="inline-flex h-8 items-center rounded-lg border border-rim px-3 text-[12.5px] transition-colors hover:bg-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {t("review.decline")}
                      </button>
                      <button
                        type="button"
                        onClick={approve}
                        className="relative inline-flex h-8 items-center overflow-hidden rounded-lg bg-primary px-3 text-[12.5px] font-medium text-primary-foreground transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        {t("review.approve", { n: changes.length })}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      {phase !== "declined" && (
                        <span className="relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-lg border border-tel-emerald/35 bg-tel-emerald/10 px-3 text-[12.5px] font-medium text-tel-emerald">
                          {ripple && (
                            <span
                              key={ripple.k}
                              aria-hidden
                              className="o-ripple pointer-events-none absolute size-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-tel-emerald/30"
                              style={{ left: ripple.x, top: ripple.y }}
                            />
                          )}
                          <Check className="size-3.5" strokeWidth={3} aria-hidden /> {t("review.approved", { n: changes.length })}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={reset}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <RotateCcw className="size-3.5" aria-hidden /> {t("review.reset")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </ProductFrame>
      </div>
    </Section>
  );
}
