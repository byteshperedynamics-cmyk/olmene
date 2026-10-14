"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, X } from "lucide-react";
import { LogoLoader, ShimmerText } from "@/components/logo-loader";
import { AnimatedFlower } from "@/components/animated-flower";
import { STEPS, waitReasonMessage } from "@/lib/steps";
import type { Job } from "@/lib/data";

/**
 * The agent console — the premium front-row seat to a running analysis.
 *
 * Design language: Claude-calm. A breathing flower instead of a spinner, a
 * thermometer rail that fills as real steps complete, honest numbers
 * (elapsed time, %, step fraction) in mono, and one animated highlight on
 * the current step. No fabricated activity — every motion reflects a real
 * state change coming from the pipeline.
 */

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function fmtElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** "nvidia/nemotron-3-super-120b-a12b:free" → "nemotron-3" (clean, still honest) */
function shortModel(m: string): string {
  const body = m.includes("/") ? m.split("/")[1] : m;
  return body.split(":")[0].split("-").slice(0, 2).join("-");
}

/** Ticking clock that starts when the job starts and freezes when it ends. */
function useElapsed(job: Job): number {
  const running = job.status === "running";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  return useMemo(() => {
    if (job.status === "completed" && job.startedAt && job.completedAt) {
      return new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime();
    }
    if (job.startedAt) return now - new Date(job.startedAt).getTime();
    return 0;
  }, [job.status, job.startedAt, job.completedAt, now]);
}

type StepState = "done" | "running" | "failed" | "pending";

function stepState(job: Job, i: number): StepState {
  const doneIdx = STEPS.findIndex((x) => x.id === job.currentStep);
  if (job.status === "completed") return "done";
  if (doneIdx > -1 && i < doneIdx) return "done";
  if (job.currentStep === STEPS[i].id) return "running";
  const log = job.stepLog?.find((l) => l.step === STEPS[i].id);
  if (log?.status === "done") return "done";
  if (log?.status === "failed") return "failed";
  return "pending";
}

export function AgentConsole({ job }: { job: Job }) {
  const reduce = useReducedMotion();
  const elapsed = useElapsed(job);

  const stepStates = useMemo(
    () => STEPS.map((_, i) => stepState(job, i)),
    [job],
  );
  const doneCount = stepStates.filter((s) => s === "done").length;
  const runningIdx = stepStates.indexOf("running");
  const isRunning = job.status === "running";
  const isQueued = job.status === "queued";

  // Honest progress: completed steps + half-credit for the step in flight.
  const pct = job.status === "completed"
    ? 100
    : Math.min(100, Math.round(((doneCount + (isRunning ? 0.5 : 0)) / STEPS.length) * 100));

  const current = runningIdx > -1 ? STEPS[runningIdx] : null;
  const waitMsg = waitReasonMessage(job.waitReason);

  const spring = { type: "spring" as const, stiffness: 120, damping: 22, mass: 0.9 };

  return (
    <section
      aria-label="Analysis progress"
      className="relative overflow-hidden rounded-2xl border bg-card shadow-lg shadow-foreground/[0.03]"
    >
      {/* Warm wash — the console glows gently from above while the agent works */}
      <AnimatePresence>
        {(isQueued || isRunning) && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklab,var(--primary)_9%,transparent),transparent_75%)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 1.2, ease: EASE } }}
            transition={{ duration: 1, ease: EASE }}
          />
        )}
      </AnimatePresence>

      <div className="relative p-5 sm:p-7">
        {/* ── Thinking header ── */}
        <div className="flex items-start gap-4 sm:gap-5" role="status" aria-live="polite">
          <AnimatedFlower size={42} glow className="mt-0.5" />

          <div className="min-w-0 flex-1">
            <ShimmerText className="text-[15px] font-semibold sm:text-base">
              {isQueued ? "Your AI agent is starting" : "Your AI agent is working"}
            </ShimmerText>
            {/* Current step hint swaps with a soft slide when the step changes */}
            <div className="mt-0.5 min-h-5">
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={job.currentStep ?? "queued"}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -6 }}
                  transition={{ duration: 0.28, ease: EASE }}
                  className="truncate text-xs text-muted-foreground sm:text-[13px]"
                >
                  {current?.hint ?? "Warming up the research pipeline…"}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          {/* Instrument readout — honest numbers, mono */}
          <div className="shrink-0 text-right" aria-hidden>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={pct}
                initial={reduce ? false : { opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -5 }}
                transition={{ duration: 0.22 }}
                className="block font-mono text-sm font-medium tabular-nums text-foreground/80"
              >
                {pct}%
              </motion.span>
            </AnimatePresence>
            <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-muted-foreground">
              {isQueued ? "queued" : `${fmtElapsed(elapsed)} elapsed`}
            </span>
          </div>
        </div>

        {/* ── Overall progress bar with a travelling sheen ── */}
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="relative h-full overflow-hidden rounded-full"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={reduce ? { duration: 0 } : spring}
          >
            <div className="absolute inset-0 bg-primary" />
            {(isQueued || isRunning) && <span className="progress-sheen" aria-hidden />}
          </motion.div>
        </div>

        {/* ── Step timeline ── */}
        <ol className="mt-6 space-y-0.5">
          {STEPS.map((s, i) => {
            const state = stepStates[i];
            const isRunningStep = state === "running";
            const log = job.stepLog?.find((l) => l.step === s.id);
            const isLast = i === STEPS.length - 1;

            return (
              <motion.li
                key={s.id}
                layout={!reduce}
                initial={reduce ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: Math.min(i * 0.05, 0.4), ease: EASE }}
                className={`relative flex items-start gap-3.5 rounded-xl px-2.5 py-2.5 sm:px-3 ${
                  isRunningStep ? "bg-primary/[0.05] ring-1 ring-inset ring-primary/20" : ""
                }`}
              >
                {/* Rail connector between dots — fills terracotta as steps complete */}
                {!isLast && (
                  <span
                    aria-hidden
                    className={`absolute left-[21px] top-[32px] bottom-[-10px] w-0.5 rounded-full transition-colors duration-700 sm:left-[23px] ${
                      state === "done" ? "bg-primary/45" : "bg-border"
                    }`}
                  />
                )}

                {/* Dot / loader / check */}
                <span className="relative z-10 mt-px grid size-6 shrink-0 place-items-center">
                  {state === "done" ? (
                    <motion.span
                      initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 24 }}
                      className="grid size-5 place-items-center rounded-full bg-score-good text-background shadow-sm"
                    >
                      <Check className="size-3" strokeWidth={3} aria-hidden />
                    </motion.span>
                  ) : state === "failed" ? (
                    <span className="grid size-5 place-items-center rounded-full bg-destructive text-white">
                      <X className="size-3" strokeWidth={3} aria-hidden />
                    </span>
                  ) : state === "running" ? (
                    <LogoLoader size={24} />
                  ) : (
                    <span className="grid size-5 place-items-center rounded-full border-2 border-border text-[11px] font-medium tabular-nums text-muted-foreground/60">
                      {i + 1}
                    </span>
                  )}
                </span>

                {/* Label + expandable detail */}
                <div className="min-w-0 flex-1 pb-0.5">
                  <p
                    className={`flex flex-wrap items-baseline gap-x-2 text-sm leading-tight ${
                      state === "pending"
                        ? "text-muted-foreground/55"
                        : state === "done"
                          ? "text-foreground/75"
                          : "font-medium text-foreground"
                    }`}
                  >
                    {s.label}
                    {state === "running" && (
                      <span className="sr-only">(in progress)</span>
                    )}
                    {state === "done" && log?.model && (
                      <span className="hidden rounded bg-muted px-1.5 py-px font-mono text-[11px] font-normal text-muted-foreground/70 sm:inline">
                        {shortModel(log.model)}
                      </span>
                    )}
                  </p>

                  <AnimatePresence initial={false}>
                    {isRunningStep && (
                      <motion.div
                        initial={reduce ? false : { height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <p className="pt-1.5 text-xs leading-relaxed text-muted-foreground">{s.hint}</p>
                      </motion.div>
                    )}
                    {state === "failed" && log?.error && (
                      <motion.div
                        initial={reduce ? false : { height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <p className="pt-1.5 text-xs leading-relaxed text-destructive">{log.error}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Step index on the right — mono, instrument-style */}
                <span className="mt-0.5 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/40" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
              </motion.li>
            );
          })}
        </ol>

        {/* ── Paused notice ── */}
        <AnimatePresence initial={false}>
          {waitMsg && (
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="overflow-hidden"
            >
              <p className="mt-5 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-foreground">
                {waitMsg}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mt-5 text-xs text-muted-foreground">
          {doneCount}/{STEPS.length} steps complete — you can close this tab; the analysis keeps
          running and the report waits on your dashboard.
        </p>
      </div>
    </section>
  );
}

/** The completion moment — one calm, warm arrival. */
export function AnalysisCompleteBanner({ job }: { job: Job }) {
  const elapsed = useElapsed(job);
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 160, damping: 20 }}
      className="flex items-center gap-4 rounded-2xl border border-[color:color-mix(in_oklab,var(--score-good)_35%,var(--border))] bg-[color:color-mix(in_oklab,var(--score-good)_8%,var(--card))] p-5 sm:p-6"
    >
      <motion.span
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 18, delay: 0.1 }}
        className="grid size-11 shrink-0 place-items-center rounded-full bg-score-good text-background shadow-md"
      >
        <Check className="size-5" strokeWidth={2.5} aria-hidden />
      </motion.span>
      <div className="min-w-0">
        <p className="font-display font-semibold tracking-tight">Your report is ready</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          All {STEPS.length} research steps finished
          {job.startedAt ? ` in ${fmtElapsed(elapsed)}` : ""} — everything below is yours.
        </p>
      </div>
    </motion.div>
  );
}
