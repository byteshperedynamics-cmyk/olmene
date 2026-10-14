import { cn } from "@/lib/utils";

/** Section label (sentence case, body face). */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("o-eyebrow", className)}>{children}</p>;
}

export type PillTone = "live" | "neutral" | "problem" | "example" | "ok";

const TONES: Record<PillTone, string> = {
  live: "border border-tel-emerald/35 bg-tel-emerald/10 text-tel-emerald",
  ok: "border border-tel-emerald/35 bg-tel-emerald/10 text-tel-emerald",
  neutral: "border border-rim bg-chip text-muted-foreground",
  problem: "border border-tel-rose/35 bg-tel-rose/10 text-tel-rose",
  example: "border border-tel-amber/40 text-tel-amber",
};

/** Small status pill. `live` adds the pulsing dot. */
export function LivePill({
  tone = "neutral",
  pulse,
  children,
  className,
}: {
  tone?: PillTone;
  pulse?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-[11px] leading-none",
        TONES[tone],
        className,
      )}
    >
      {(pulse ?? tone === "live") && <span className="o-pulse-dot" aria-hidden />}
      {children}
    </span>
  );
}

/** "Example data" badge for any illustrative figure. */
export function ExampleBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border border-tel-amber/40 px-2 py-0.5 text-[13px] font-medium capitalize text-tel-amber",
        className,
      )}
    >
      {label}
    </span>
  );
}

/** Product frame: hairline window chrome around a real UI rendering. */
export function ProductFrame({
  url,
  badge,
  children,
  className,
}: {
  url: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("o-artifact min-w-0 overflow-hidden rounded-2xl", className)}>
      <div className="flex items-center gap-3 border-b border-edge px-3.5 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          <i className="size-2.5 rounded-full bg-line-strong" />
          <i className="size-2.5 rounded-full bg-line-strong" />
          <i className="size-2.5 rounded-full bg-line-strong" />
        </div>
        <div className="o-well min-w-0 flex-1 truncate rounded-md px-2.5 py-1 font-mono text-[11.5px] text-faint" dir="ltr">
          {url}
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

/** Horizontal confidence bar with a text label (never color alone). */
export function ConfidenceBar({
  level,
  label,
  className,
}: {
  level: "low" | "medium" | "high";
  label: string;
  className?: string;
}) {
  const pct = level === "high" ? 88 : level === "medium" ? 60 : 30;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <span
          className="o-anim block h-full origin-left rounded-full bg-foreground animate-[o-grow_1.6s_var(--ease-out-expo)_both] rtl:origin-right"
          style={{ width: `${pct}%`, opacity: level === "low" ? 0.55 : 1 }}
        />
      </span>
      <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
    </span>
  );
}
