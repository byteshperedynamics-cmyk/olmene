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
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  duration?: number;
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
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [armed, inView, value, duration]);

  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(lang).format(shown);
  } catch {
    formatted = String(shown);
  }

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
