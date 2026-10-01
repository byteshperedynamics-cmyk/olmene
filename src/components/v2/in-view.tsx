"use client";

import { useEffect, useRef, useState, type ElementType, type ComponentPropsWithoutRef } from "react";

/**
 * useInView — true once/while the element intersects the viewport.
 * `once` latches true on first sight (count-ups, draw-ins); otherwise it
 * tracks visibility (used to pause ambient loops off-screen).
 */
export function useInView<T extends Element>({ once = false, rootMargin = "0px" } = {}) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, rootMargin]);

  return [ref, inView] as const;
}

type InViewProps<T extends ElementType> = { as?: T } & ComponentPropsWithoutRef<T>;

/**
 * InView — wraps a region and sets data-inview="true|false" so every CSS loop
 * inside pauses while it is off-screen (rule lives in globals.css). Before
 * hydration the attribute is absent, so animations run as authored.
 */
export function InView<T extends ElementType = "div">({ as, ...props }: InViewProps<T>) {
  const Comp = (as ?? "div") as ElementType;
  const [ref, inView] = useInView<HTMLElement>({ rootMargin: "120px" });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <Comp ref={ref} data-inview={mounted ? String(inView) : undefined} {...props} />;
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
