import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ScanPreview — the hero's signature motion, one 6s loop:
 *   beam sweeps the page → three issue pins lift as it passes → the
 *   "PR opened" toast settles → pins turn green and the score ticks 61 → 94.
 * Pure CSS (no JS, no framer-motion). The resting state (no animation, e.g.
 * reduced motion) is the finished one: pins fixed, score 94, toast shown.
 */
export function ScanPreview({
  pins,
  toastTitle,
  toastMeta,
  previewLabel,
  scoreLabel,
  url = "acme-analytics.com",
  className,
}: {
  /** Three short finding labels (translated). */
  pins: [string, string, string];
  toastTitle: string;
  toastMeta: string;
  /** Visually marks the visual as an illustration, e.g. "Preview". */
  previewLabel: string;
  /** Caption for the score chip, e.g. "readiness / 100". */
  scoreLabel?: string;
  url?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "o-anim relative min-h-[330px] overflow-hidden rounded-2xl border border-line-strong bg-card",
        "shadow-[0_30px_80px_-30px_rgb(0_0_0/0.5),0_0_0_1px_rgb(255_255_255/0.02)_inset]",
        className,
      )}
      role="img"
      aria-label={`${pins.join(", ")}. ${toastTitle}`}
    >
      {/* Browser chrome */}
      <div className="flex items-center gap-3 border-b border-line-strong bg-surface-2/60 px-3.5 py-2.5" aria-hidden>
        <div className="flex gap-1.5">
          <i className="size-2 rounded-full bg-line-strong" />
          <i className="size-2 rounded-full bg-line-strong" />
          <i className="size-2 rounded-full bg-line-strong" />
        </div>
        <div dir="ltr" className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-background/70 px-2.5 py-1 font-mono text-[10.5px] text-muted-foreground">
          <i className="size-1.5 shrink-0 rounded-full bg-primary/70" />
          <span className="truncate">{url}</span>
        </div>
        <span className="shrink-0 rounded-full border border-signal-amber/40 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-signal-amber">
          {previewLabel}
        </span>
      </div>

      {/* Wireframe of the site */}
      <div className="relative grid gap-2.5 p-4 sm:p-5" aria-hidden>
        <div className="flex items-center justify-between">
          <i className="block h-2.5 w-14 rounded bg-surface-2" />
          <div className="flex gap-2">
            <i className="block h-2 w-7 rounded bg-surface-2" />
            <i className="block h-2 w-7 rounded bg-surface-2" />
            <i className="block h-2 w-9 rounded bg-primary/25" />
          </div>
        </div>
        <i className="mt-2 block h-5 w-[64%] rounded bg-surface-2" />
        <i className="block h-5 w-[44%] rounded bg-surface-2" />
        <i className="block h-2.5 w-[52%] rounded bg-surface-2/70" />
        <div className="mt-1 flex gap-2">
          <i className="block h-6 w-20 rounded-md bg-primary/30" />
          <i className="block h-6 w-16 rounded-md border border-line-strong" />
        </div>
        <div className="o-grid-bg mt-1 h-16 rounded-lg border border-line-strong bg-gradient-to-br from-surface-2 to-leaf-soft [background-size:18px_18px]" />
        <div className="grid grid-cols-3 gap-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid gap-1.5 rounded-md bg-surface-2/70 p-2">
              <i className="size-2.5 rounded-full bg-line-strong" />
              <i className="block h-1.5 w-[80%] rounded bg-line-strong/70" />
              <i className="block h-1.5 w-[55%] rounded bg-line-strong/50" />
            </div>
          ))}
        </div>
        <div className="h-12" />

        {/* Score chip: 61 → 94 */}
        <div className="absolute end-4 top-12 grid justify-items-end rounded-lg border border-line-strong bg-background/90 px-2.5 py-1.5 shadow-[0_8px_24px_-8px_rgb(0_0_0/0.4)] sm:end-5">
          <span className="relative block h-7 w-10 font-display text-[26px] leading-7 tabular-nums">
            <span className="absolute inset-0 text-end text-signal-rust opacity-0 animate-[o-hp-before_6s_linear_infinite]">61</span>
            <span className="absolute inset-0 text-end text-primary animate-[o-hp-after_6s_linear_infinite]">94</span>
          </span>
          {scoreLabel && <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-faint">{scoreLabel}</span>}
        </div>
      </div>

      {/* Scan beam */}
      <div className="pointer-events-none absolute inset-x-0 top-10 bottom-0 animate-[o-hp-beam_6s_linear_infinite] opacity-0" aria-hidden>
        <div className="absolute inset-x-0 bottom-0 h-16 border-b border-primary bg-gradient-to-b from-transparent to-leaf-soft shadow-[0_8px_24px_-6px_var(--glow)]" />
      </div>

      {/* Issue pins: lift as the beam passes, turn green once the PR lands */}
      {pins.map((label, i) => (
        <div
          key={label}
          aria-hidden
          className={cn(
            "absolute flex max-w-[62%] items-center gap-1.5 rounded-lg border border-line-strong bg-background py-1 pe-2.5 ps-1.5 font-mono text-[10.5px] shadow-[0_8px_24px_-6px_rgb(0_0_0/0.35)]",
            i === 0 && "start-[7%] top-[47%] animate-[o-hp-pin1_6s_linear_infinite]",
            i === 1 && "end-[6%] top-[60%] animate-[o-hp-pin2_6s_linear_infinite]",
            i === 2 && "start-[12%] top-[73%] animate-[o-hp-pin3_6s_linear_infinite]",
          )}
        >
          <span className="relative grid size-3.5 shrink-0 place-items-center">
            <b className="absolute size-1.5 rounded-full bg-signal-rust opacity-0 animate-[o-hp-before_6s_linear_infinite]" />
            <Check className="absolute size-3 text-primary animate-[o-hp-after_6s_linear_infinite]" strokeWidth={3} />
          </span>
          <span className="truncate">{label}</span>
        </div>
      ))}

      {/* PR opened toast */}
      <div
        aria-hidden
        className="absolute inset-x-4 bottom-3.5 flex items-center gap-2.5 rounded-xl bg-primary px-3 py-2.5 text-[12.5px] font-medium text-primary-foreground shadow-[0_10px_30px_-8px_var(--glow)] animate-[o-hp-toast_6s_var(--ease-out-expo)_infinite] sm:inset-x-5"
      >
        <span className="relative grid size-2 shrink-0 place-items-center">
          <span className="absolute size-2 rounded-full bg-primary-foreground" />
          <span className="absolute size-2 rounded-full bg-primary-foreground/50 animate-[o-ring_2s_ease-out_infinite]" />
        </span>
        <span className="truncate">{toastTitle}</span>
        <span className="ms-auto shrink-0 font-mono text-[11px] opacity-80">{toastMeta}</span>
      </div>
    </div>
  );
}
