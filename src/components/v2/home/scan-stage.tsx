"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useFreeAudit } from "@/components/free-audit-form";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { prefersReducedMotion } from "../in-view";
import { ScanPreview } from "../scan-preview";
import type { SceneHandle } from "./scan-scene";

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * The hero stage: a 3D scan of an example homepage (scan-scene.ts). The page
 * renders a still poster first; three.js loads when the browser is idle and
 * crossfades in. Without WebGL the 2D ScanPreview takes its place. The chips,
 * score and PR card are HTML so they stay sharp and translate cleanly; the
 * scene only moves them and flips their data-state.
 */
export function ScanStage() {
  const { t } = useI18n();
  const { url } = useFreeAudit();
  const host = useRef<HTMLDivElement>(null);
  const chips = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const pr = useRef<HTMLDivElement>(null);
  const score = useRef<HTMLSpanElement>(null);
  const scoreBox = useRef<HTMLDivElement>(null);
  const scene = useRef<SceneHandle | null>(null);
  const [mode, setMode] = useState<"poster" | "live" | "fallback">("poster");
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (!hasWebGL()) {
      setMode("fallback");
      return;
    }
    const isReduced = prefersReducedMotion();
    setReduced(isReduced);
    let cancelled = false;
    const start = () => {
      import("./scan-scene")
        .then(({ mountScanScene }) => {
          if (cancelled || !host.current || !pr.current || !score.current || !scoreBox.current) return;
          const font = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
          scene.current = mountScanScene({
            host: host.current,
            chips: chips.map((c) => c.current!).filter(Boolean),
            pr: pr.current,
            score: score.current,
            scoreBox: scoreBox.current,
            reduced: isReduced,
            dark: document.documentElement.classList.contains("dark"),
            url: "",
            fontFamily: font,
            onFirstFrame: () => setMode("live"),
          });
        })
        .catch(() => setMode("fallback"));
    };
    // The headline paints first; the 3D scene loads when the browser is idle.
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const id = w.requestIdleCallback ? w.requestIdleCallback(start, { timeout: 1500 }) : window.setTimeout(start, 300);

    // Follow the system appearance while the page is open.
    const mo = new MutationObserver(() => scene.current?.setTheme(document.documentElement.classList.contains("dark")));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      cancelled = true;
      if (w.cancelIdleCallback) w.cancelIdleCallback(id);
      else window.clearTimeout(id);
      mo.disconnect();
      scene.current?.dispose();
      scene.current = null;
    };
    // mount once: the refs are stable
  }, []);

  // The address bar shows the site being typed into the scan box.
  useEffect(() => {
    const id = window.setTimeout(() => scene.current?.setUrl(url), 160);
    return () => window.clearTimeout(id);
  }, [url, mode]);

  useEffect(() => {
    scene.current?.setPaused(paused);
  }, [paused]);

  if (mode === "fallback") {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <ScanPreview pins={[t("scan.pin1"), t("scan.pin2"), t("scan.pin3")]} previewLabel={t("scan.preview")} scoreLabel={t("scores.readiness")} />
      </div>
    );
  }

  const found = [t("scan.pin1"), t("scan.pin2"), t("scan.pin3")];
  const fixed = [t("stage.fix1"), t("stage.fix2"), t("stage.fix3")];

  return (
    <figure className="relative mx-auto w-full max-w-[1240px]">
      <div ref={host} role="img" aria-label={t("stage.aria")} data-mode={mode} className="o-stage relative w-full">
        {/* Still poster: the same pose in CSS, so nothing jumps when the scene arrives */}
        <div aria-hidden className="o-stage-poster" />

        <div aria-hidden className="pointer-events-none absolute inset-0">
          {chips.map((ref, i) => (
            <div
              key={i}
              ref={ref}
              data-state="hidden"
              data-side={i < 2 ? "end" : "start"}
              data-lift={i === 0 ? "up" : i === 1 ? "down" : undefined}
              className="o-stage-chip"
            >
              <span className="o-stage-chip-inner">
                <span className="o-stage-dot" /> <span className="o-stage-found">{found[i]}</span>
                <span className="o-stage-fixed">{fixed[i]}</span>
              </span>
            </div>
          ))}
        </div>

        <span aria-hidden className="absolute start-4 top-4 rounded-full border border-tel-amber/40 bg-background/60 px-2.5 py-1 text-[12px] font-medium capitalize text-tel-amber backdrop-blur sm:start-6 sm:top-6">
          {t("common.example")}
        </span>

        <div ref={pr} aria-hidden data-state="off" className="o-stage-pr">
          <span className="size-1.5 rounded-full bg-tel-sky" /> {t("stage.pr")}
        </div>

        <div ref={scoreBox} aria-hidden data-state="low" className="o-stage-score">
          <span className="text-[12px] text-muted-foreground">{t("scores.readiness")}</span>{" "}
          <span className="o-readout-strong text-[26px] leading-none sm:text-[32px]">
            <span ref={score} data-score>61</span>
          </span>
        </div>

        {!reduced && mode === "live" && (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? t("stage.play") : t("stage.pause")}
            className="o-hit absolute bottom-4 end-4 z-[2] grid size-9 place-items-center rounded-full border border-rim bg-background/70 text-muted-foreground backdrop-blur transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:bottom-6 sm:end-6"
          >
            {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
          </button>
        )}
      </div>
      <figcaption className="sr-only">{t("stage.aria")}</figcaption>
      <noscript>
        <p className={cn("text-center text-sm text-muted-foreground")}>{t("stage.aria")}</p>
      </noscript>
    </figure>
  );
}
