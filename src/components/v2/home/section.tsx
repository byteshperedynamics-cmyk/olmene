import { cn } from "@/lib/utils";
import { Eyebrow } from "../atoms";

/** Section rhythm (refinement 2026-10-30): 80–96px between sections (two paddings of 40–48px); max-w-6xl. */
export function Section({
  id,
  className,
  innerClassName,
  children,
  "aria-label": ariaLabel,
}: {
  id?: string;
  className?: string;
  innerClassName?: string;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  return (
    <section id={id} aria-label={ariaLabel} className={cn("scroll-mt-24 py-10 md:py-12", className)}>
      <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", innerClassName)}>{children}</div>
    </section>
  );
}

/** Eyebrow + display heading (+ optional lede), left-aligned editorial. */
export function SectionHeader({
  eyebrow,
  title,
  lede,
  className,
}: {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  lede?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid max-w-3xl gap-4", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="o-display text-[30px] leading-[1.08] tracking-[-0.02em] sm:text-[36px] lg:text-[42px]">{title}</h2>
      {lede && <p className="max-w-[40rem] text-[17px] leading-relaxed text-muted-foreground sm:text-[18px]">{lede}</p>}
    </div>
  );
}
