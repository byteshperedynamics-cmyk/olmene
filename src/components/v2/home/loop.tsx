"use client";

import { useEffect, useState } from "react";
import { Check, GitBranch, GitMerge, X } from "lucide-react";
import { CHECK_COUNT } from "@/lib/config";
import { useI18n } from "@/i18n/provider";
import { useStage, type Stage } from "../in-view";
import { Section, SectionHeader } from "./section";

/**
 * "Find it. Fix it. Prove it." — a bento of three live stages that play once,
 * in order, when the grid scrolls into view (DESIGN.md §6):
 *   01 Scan   a laser sweeps a DOM tree; nodes resolve to ✓ (one ✗: the
 *             missing meta description the next stage fixes)
 *   02 Fix    the deletion dims, the insertion types in, the branch pill lands
 *   03 Verify "Merged to main" lights, the gauge needle springs 61 → 94
 * Server render, no-JS and reduced motion show the finished state. All three
 * are illustrations of one example fix on acme-analytics.com.
 */

const T_FIX = 2100; // ms after start: stage 02 begins
const T_VERIFY = 4300; // stage 03 begins

export function HomeLoop() {
  const { t } = useI18n();
  const [ref, stage] = useStage<HTMLDivElement>();

  const cards = [
    { n: "01", title: "loop.s1.title", body: "loop.s1.body", visual: <ScanStage stage={stage} /> },
    { n: "02", title: "loop.s2.title", body: "loop.s2.body", visual: <FixStage stage={stage} /> },
    { n: "03", title: "loop.s3.title", body: "loop.s3.body", visual: <VerifyStage stage={stage} /> },
  ];

  return (
    <Section id="how-it-works">
      <SectionHeader eyebrow={t("common.howItWorks")} title={t("loop.title")} />

      <div ref={ref} data-stage={stage} className="o-loop mt-12 grid gap-4 lg:grid-cols-3">
        {cards.map((c) => (
          <article key={c.n} className="o-artifact grid min-w-0 content-start gap-5 rounded-2xl p-4 sm:p-5">
            <div className="o-well relative h-[212px] overflow-hidden rounded-xl" aria-hidden>
              {c.visual}
            </div>
            <div className="grid gap-2 px-1">
              <div className="flex items-baseline gap-3">
                <span className="o-readout-strong text-xs text-faint">{c.n}</span>{" "}
                <h3 className="o-display text-2xl">{t(c.title)}</h3>
              </div>
              <p className="max-w-[64ch] text-[15px] leading-relaxed text-muted-foreground">{t(c.body, { n: CHECK_COUNT })}</p>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

/* ── 01 Scan: laser over a DOM tree ───────────────────────────────────── */

const NODES: Array<{ code: string; depth: number; ok: boolean | null }> = [
  { code: "<head>", depth: 0, ok: null },
  { code: "<title>Acme</title>", depth: 1, ok: true },
  { code: '<meta name="description">', depth: 1, ok: false },
  { code: '<link rel="canonical">', depth: 1, ok: true },
  { code: '<meta property="og:title">', depth: 1, ok: true },
  { code: "<body>", depth: 0, ok: null },
  { code: "<h1>Product analytics…</h1>", depth: 1, ok: true },
  { code: '<img alt="Dashboard">', depth: 1, ok: true },
];

function ScanStage({ stage }: { stage: Stage }) {
  return (
    <div dir="ltr" className="relative h-full px-4 py-3.5 font-mono text-[11px] leading-[22px]">
      {NODES.map((n, i) => (
        <div
          key={n.code}
          className="o-node flex items-center gap-2"
          style={{ paddingInlineStart: n.depth * 14, ["--d" as string]: `${120 + i * 190}ms` }}
        >
          <span className="relative grid size-3.5 shrink-0 place-items-center">
            {n.ok === null ? (
              <span className="size-1 rounded-full bg-faint" />
            ) : (
              <>
                <span className="o-node-wait absolute size-1.5 rounded-full border border-faint" />
                {n.ok ? (
                  <Check className="o-node-mark absolute size-3.5 text-tel-emerald" strokeWidth={3} />
                ) : (
                  <X className="o-node-mark absolute size-3.5 text-tel-rose" strokeWidth={3} />
                )}
              </>
            )}
          </span>
          <span className={`truncate ${n.ok === false ? "text-foreground" : "text-muted-foreground"}`}>{n.code}</span>
          {n.ok === false && (
            <span className="o-node-mark ms-auto shrink-0 rounded border border-tel-rose/35 px-1.5 text-[9.5px] leading-4 text-tel-rose">missing</span>
          )}
        </div>
      ))}
      {stage !== "final" && <div className="o-laser pointer-events-none absolute inset-x-0 top-0 h-px" />}
    </div>
  );
}

/* ── 02 Fix: deletion dims, insertion types in, branch pill lands ────── */

const INSERTION = '<meta name="description" content="See where users drop off in your product and fix it in a day." />';

function FixStage({ stage }: { stage: Stage }) {
  const [typed, setTyped] = useState(stage === "final" ? INSERTION.length : 0);
  const done = stage === "final" || typed >= INSERTION.length;

  useEffect(() => {
    if (stage === "final") {
      setTyped(INSERTION.length);
      return;
    }
    if (stage !== "run") {
      setTyped(0);
      return;
    }
    let i = 0;
    let timer = window.setTimeout(function tick() {
      i = Math.min(INSERTION.length, i + 2);
      setTyped(i);
      if (i < INSERTION.length) timer = window.setTimeout(tick, 18);
    }, T_FIX + 450);
    return () => window.clearTimeout(timer);
  }, [stage]);

  return (
    <div dir="ltr" className="grid h-full content-between p-3.5 font-mono text-[11px] leading-[1.75]">
      <div className="grid gap-2">
        <div className="flex items-center justify-between text-[10.5px] text-faint">
          <span>app/layout.tsx</span>
          <span>
            <span className="text-tel-emerald">+1</span> <span className="text-tel-rose">−1</span>
          </span>
        </div>
        <div className="o-del rounded-md bg-diff-del px-2 py-1">
          <span className="text-tel-rose">− </span>
          <span className="text-muted-foreground line-through decoration-tel-rose/50">{'<meta name="description" content="" />'}</span>
        </div>
        <div className="min-h-[58px] rounded-md bg-diff-add px-2 py-1 text-foreground">
          <span className="text-tel-emerald">+ </span>
          <span className="[overflow-wrap:anywhere]">{INSERTION.slice(0, typed)}</span>
          {!done && <span className="ms-px inline-block h-3 w-[6px] translate-y-[2px] animate-[o-caret_0.9s_steps(1)_infinite] bg-foreground/80" />}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] text-faint">acme/site</span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-tel-sky/40 bg-chip px-2.5 py-1 text-[10.5px] text-tel-sky transition-[opacity,transform] duration-300 ease-[var(--ease-out-expo)]"
          style={done ? undefined : { opacity: 0, transform: "translateY(6px) scale(0.92)" }}
        >
          <GitBranch className="size-3" aria-hidden /> olmene/fix-14
        </span>
      </div>
    </div>
  );
}

/* ── 03 Verify: "Merged to main", then the needle springs 61 → 94 ───── */

const R = 64;
const ARC = Math.PI * R; // semicircle length

function VerifyStage({ stage }: { stage: Stage }) {
  const { t } = useI18n();
  const [score, setScore] = useState(stage === "final" ? 94 : 61);
  const [merged, setMerged] = useState(stage === "final");

  useEffect(() => {
    if (stage === "final") {
      setScore(94);
      setMerged(true);
      return;
    }
    setScore(61);
    setMerged(false);
    if (stage !== "run") return;
    let raf = 0;
    const mergeTimer = window.setTimeout(() => {
      setMerged(true);
      // damped spring toward 94 (slight overshoot, settles in ~1.1 s)
      let x = 61;
      let v = 0;
      let last = 0;
      const step = (now: number) => {
        const dt = last ? Math.min(0.032, (now - last) / 1000) : 0.016;
        last = now;
        const a = 170 * (94 - x) - 17 * v;
        v += a * dt;
        x += v * dt;
        setScore(x);
        if (Math.abs(94 - x) > 0.05 || Math.abs(v) > 0.05) raf = requestAnimationFrame(step);
        else setScore(94);
      };
      raf = requestAnimationFrame(step);
    }, T_VERIFY);
    return () => {
      window.clearTimeout(mergeTimer);
      cancelAnimationFrame(raf);
    };
  }, [stage]);

  const p = Math.max(0, Math.min(100, score)) / 100;
  const angle = -90 + p * 180;
  const good = score >= 90;

  return (
    <div className="grid h-full content-between justify-items-center p-3.5">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10.5px] transition-colors duration-300 ${
          merged ? "border-tel-emerald/40 bg-tel-emerald/10 text-tel-emerald" : "border-edge text-faint"
        }`}
      >
        <GitMerge className="size-3" aria-hidden /> {t("loop.merged")}
      </span>
      <div className="relative" dir="ltr">
        <svg width="168" height="96" viewBox="-84 -84 168 96">
          <path d={`M ${-R} 0 A ${R} ${R} 0 0 1 ${R} 0`} fill="none" stroke="var(--line-strong)" strokeWidth="8" strokeLinecap="round" />
          <path
            d={`M ${-R} 0 A ${R} ${R} 0 0 1 ${R} 0`}
            fill="none"
            stroke={good ? "var(--tel-emerald)" : "var(--tel-amber)"}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${ARC * p} ${ARC}`}
          />
          <g transform={`rotate(${angle})`}>
            <line x1="0" y1="0" x2="0" y2={-R + 14} stroke="var(--foreground)" strokeWidth="2" strokeLinecap="round" />
          </g>
          <circle r="5" fill="var(--foreground)" />
        </svg>
      </div>
      <span className="o-readout-strong -mt-1 flex items-baseline gap-1.5 text-[12px] text-faint">
        <span className={good ? "text-tel-emerald" : "text-foreground"} style={{ fontSize: 24 }}>
          {Math.round(score)}
        </span>{" "}
        <span className="font-mono text-[10px] uppercase tracking-[0.12em]">{t("scores.readiness")}</span>
      </span>
    </div>
  );
}
