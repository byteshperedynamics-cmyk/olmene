"use client";

import { useEffect, useState } from "react";
import { useInView, prefersReducedMotion } from "./in-view";
import { useI18n } from "@/i18n/provider";

/**
 * CountUp — renders the FINAL value on the server and before hydration (so
 * crawlers, screenshots and no-JS visitors see the real number), then on first
 * intersection counts up from 0 once. Reduced motion: no animation.
 */
export function CountUp({
  value,
  duration = 1400,
  fromRatio = 0,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  duration?: number;
  /** Count only the last part: 0.85 starts at 85% of the value (instrument-style settle). */
  fromRatio?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const { lang } = useI18n();
  const [ref, inView] = useInView<HTMLSpanElement>({ once: true });
  const [shown, setShown] = useState(value);
  const [armed, setArmed] = useState(false);

  // Arm only on the client, after mount: the first paint keeps the real value.
  useEffect(() => {
    if (!prefersReducedMotion()) setArmed(true);
  }, []);

  useEffect(() => {
    if (!armed || !inView) return;
    let raf = 0;
    let t0 = 0;
    const step = (t: number) => {
      if (!t0) t0 = t;
      const p = Math.min((t - t0) / duration, 1);
      // exponential ease-out: fast start, long precise settle
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      const from = value * fromRatio;
      setShown(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [armed, inView, value, duration]);

  // Only the running count-up shows `shown`; otherwise (reduced motion, not yet
  // in view, or a live value that arrived later) the real value is on screen.
  const display = armed && inView ? shown : value;
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(lang).format(display);
  } catch {
    formatted = String(display);
  }

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
