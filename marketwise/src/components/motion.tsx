"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shared motion primitives — the house style is calm and deliberate:
 * short distances, gentle easing, no bounce, everything runs once.
 *
 * Implemented with IntersectionObserver + CSS transitions (globals.css
 * `[data-reveal]`) instead of framer-motion: identical fade-up behavior
 * without shipping a 43KB animation runtime on marketing pages.
 * Reduced-motion and no-JS visitors see content immediately (CSS-level
 * fallback), which is strictly better than the old inline opacity:0.
 */

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type RevealState = "out" | "in";

function revealStyle(y: number, delay: number): React.CSSProperties {
  return {
    "--reveal-y": `${y}px`,
    transitionDelay: delay > 0 ? `${delay}s` : undefined,
  } as React.CSSProperties;
}

/**
 * Fade-up reveal when the element scrolls into view.
 * Use `delay` to stagger siblings (e.g. i * 0.06).
 */
export function Reveal({
  children,
  delay = 0,
  className,
  y = 18,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<RevealState>("out");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      setState("in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("in");
          io.disconnect();
        }
      },
      { rootMargin: "-64px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} data-reveal={state} className={className} style={revealStyle(y, delay)}>
      {children}
    </div>
  );
}

/**
 * Fade-up entrance on mount (no scroll dependency).
 * For content that is visible immediately, prefer CSS `.hero-in` on the
 * landing page (SSR-safe); use this inside client views.
 */
export function Enter({
  children,
  delay = 0,
  className,
  y = 14,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}) {
  const [state, setState] = useState<RevealState>("out");

  useEffect(() => {
    if (prefersReducedMotion()) {
      setState("in");
      return;
    }
    const raf = requestAnimationFrame(() => setState("in"));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div data-reveal={state} className={className} style={revealStyle(y, delay)}>
      {children}
    </div>
  );
}
