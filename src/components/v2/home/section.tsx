import { cn } from "@/lib/utils";
import { Eyebrow } from "../atoms";

/** Standard v2 section rhythm: 96px desktop / 64px mobile, max-w-6xl. */
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
    <section id={id} aria-label={ariaLabel} className={cn("scroll-mt-20 py-16 md:py-24", className)}>
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
    <div className={cn("grid max-w-2xl gap-4", className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="o-display text-[30px] leading-[1.08] sm:text-[40px]">{title}</h2>
      {lede && <p className="text-[17px] leading-relaxed text-muted-foreground">{lede}</p>}
    </div>
  );
}
