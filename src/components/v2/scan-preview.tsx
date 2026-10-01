import { cn } from "@/lib/utils";

/**
 * ScanPreview — the hero's signature motion. A wireframe of a homepage, a scan
 * beam sweeping it, issue pins lifting as it passes, and a "PR opened" toast
 * settling. Pure CSS (no JS, no framer-motion): it renders complete at rest and
 * every loop stops under reduced motion (.o-anim).
 */
export function ScanPreview({
  pins,
  toastTitle,
  toastMeta,
  previewLabel,
  className,
}: {
  /** Three short finding labels (translated). */
  pins: [string, string, string];
  toastTitle: string;
  toastMeta: string;
  /** Visually marks the visual as an illustration, e.g. "Preview". */
  previewLabel: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "o-anim relative min-h-[300px] overflow-hidden rounded-2xl border border-line-strong bg-card p-4 sm:p-5",
        "shadow-[0_30px_80px_-30px_rgb(0_0_0/0.45)]",
        className,
      )}
      role="img"
      aria-label={`${pins.join(", ")}. ${toastTitle}`}
    >
      {/* Wireframe of a site */}
      <div className="grid gap-2.5" aria-hidden>
        <div className="flex items-center justify-between">
          <i className="block h-2.5 w-16 rounded bg-surface-2" />
          <div className="flex gap-2">
            <i className="block h-2.5 w-8 rounded bg-surface-2" />
            <i className="block h-2.5 w-8 rounded bg-surface-2" />
            <i className="block h-2.5 w-10 rounded bg-surface-2" />
          </div>
        </div>
        <i className="mt-3 block h-6 w-[72%] rounded bg-surface-2" />
        <i className="block h-3 w-[48%] rounded bg-surface-2" />
        <i className="mt-1 block h-20 rounded-lg bg-surface-2" />
        <div className="grid grid-cols-3 gap-2.5">
          <i className="block h-12 rounded-md bg-surface-2" />
          <i className="block h-12 rounded-md bg-surface-2" />
          <i className="block h-12 rounded-md bg-surface-2" />
        </div>
        <i className="block h-3 rounded bg-surface-2" />
        <i className="block h-3 w-[40%] rounded bg-surface-2" />
      </div>

      {/* Scan beam */}
      <div className="pointer-events-none absolute inset-0 animate-[o-beam_4s_var(--ease-out-expo)_infinite]" aria-hidden>
        <div className="absolute inset-x-0 bottom-0 h-14 border-b border-primary bg-gradient-to-b from-transparent to-leaf-soft shadow-[0_6px_18px_-6px_var(--glow)]" />
      </div>

      {/* Issue pins */}
      {pins.map((label, i) => (
        <div
          key={label}
          aria-hidden
          className={cn(
            "absolute flex max-w-[70%] items-center gap-1.5 rounded-lg border border-line-strong bg-background py-1 pe-2.5 ps-2 font-mono text-[10.5px] shadow-[0_6px_20px_rgb(0_0_0/0.2)] animate-[o-pin_4s_var(--ease-out-expo)_infinite]",
            i === 0 && "end-[6%] top-[15%] [animation-delay:0.3s]",
            i === 1 && "start-[7%] top-[45%] [animation-delay:1s]",
            i === 2 && "end-[9%] top-[66%] [animation-delay:1.7s]",
          )}
        >
          <b className="size-1.5 shrink-0 rounded-full bg-signal-rust" />
          <span className="truncate">{label}</span>
        </div>
      ))}

      {/* PR opened toast */}
      <div
        aria-hidden
        className="absolute inset-x-4 bottom-3.5 flex items-center gap-2.5 rounded-xl bg-primary px-3 py-2.5 text-[12.5px] font-medium text-primary-foreground animate-[o-toast_4s_var(--ease-out-expo)_infinite] sm:inset-x-5"
      >
        <span className="size-1.5 shrink-0 rounded-full bg-primary-foreground" />
        <span className="truncate">{toastTitle}</span>
        <span className="ms-auto shrink-0 font-mono text-[11px] opacity-80">{toastMeta}</span>
      </div>

      <span className="absolute end-3 top-3 rounded-full border border-signal-amber/40 bg-card px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-signal-amber">
        {previewLabel}
      </span>
    </div>
  );
}
