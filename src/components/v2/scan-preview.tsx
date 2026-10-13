import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ScanPreview — the hero artifact (DESIGN.md §6). One 9 s loop, pure CSS:
 *   1. a white laser sweeps the page and three leak pins land on it;
 *   2. connectors draw from each pin down to the diff line that fixes it,
 *      and the line lights up (+);
 *   3. the score bridge runs: 61 / 100 (rose) → PR #14 → 94 / 100 (emerald);
 *   4. hold, then reset.
 * Pins, diff lines and connectors share one coordinate box (480 × 560), so
 * the wires stay attached at every width. Reduced motion and no-JS show the
 * finished state. The whole artifact is an illustration (marked "Preview").
 */

const PINS = [
  { x: 5, y: 17.5, anchorX: 6, anchorY: 21, side: "start" as const },
  { x: 5, y: 29.5, anchorX: 94, anchorY: 33, side: "end" as const },
  { x: 9, y: 41.5, anchorX: 10, anchorY: 45, side: "start" as const },
];
/** y (%) of the three diff lines; connectors end at x = 7%. */
const LINES_Y = [64.6, 70.2, 75.8];

export function ScanPreview({
  pins,
  previewLabel,
  scoreLabel,
  url = "acme-analytics.com",
  className,
}: {
  /** Three short finding labels (translated). */
  pins: [string, string, string];
  /** Marks the visual as an illustration, e.g. "Preview". */
  previewLabel: string;
  /** Caption for the score, e.g. "readiness / 100". */
  scoreLabel?: string;
  url?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("o-anim o-artifact relative overflow-hidden rounded-2xl", className)}
      role="img"
      aria-label={`${pins.join(", ")}. 61 → 94 ${scoreLabel ?? ""}`}
    >
      {/* Browser chrome */}
      <div className="relative z-[2] flex items-center gap-3 border-b border-edge px-3.5 py-2.5" aria-hidden>
        <div className="flex gap-1.5">
          <i className="size-2 rounded-full bg-line-strong" />
          <i className="size-2 rounded-full bg-line-strong" />
          <i className="size-2 rounded-full bg-line-strong" />
        </div>
        <div dir="ltr" className="o-well flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[10.5px] text-muted-foreground">
          <i className="size-1.5 shrink-0 rounded-full bg-faint" />
          <span className="truncate">{url}</span>
        </div>
        <span className="shrink-0 rounded-full border border-tel-amber/40 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-tel-amber">
          {previewLabel}
        </span>
      </div>

      {/* One coordinate box for pins, wires, diff and the bridge */}
      <div className="relative aspect-[480/520] w-full" aria-hidden>
        {/* Wireframe of the scanned page */}
        <div className="absolute inset-x-[5%] top-[3%] grid h-[44%] content-start gap-[3.2%]">
          <div className="flex items-center justify-between">
            <i className="block h-2.5 w-14 rounded bg-foreground/15" />
            <div className="flex gap-2">
              <i className="block h-2 w-7 rounded bg-foreground/10" />
              <i className="block h-2 w-7 rounded bg-foreground/10" />
              <i className="block h-2 w-9 rounded bg-foreground/10" />
            </div>
          </div>
          <i className="mt-2 block h-[18px] w-[64%] rounded bg-foreground/[0.13]" />
          <i className="block h-[18px] w-[44%] rounded bg-foreground/[0.13]" />
          <i className="block h-2.5 w-[52%] rounded bg-foreground/[0.07]" />
          <div className="mt-1 flex gap-2">
            <i className="block h-6 w-20 rounded-md bg-foreground/80" />
            <i className="block h-6 w-16 rounded-md border border-foreground/20" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="grid gap-1.5 rounded-md border border-edge bg-foreground/[0.03] p-2">
                <i className="size-2 rounded-full bg-foreground/15" />
                <i className="block h-1.5 w-[80%] rounded bg-foreground/10" />
              </div>
            ))}
          </div>
        </div>

        {/* Laser: a white scan line sweeps the page once per loop */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[50%] overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-full -translate-y-full animate-[o-hp-beam_9s_linear_infinite] opacity-0">
            <div className="absolute inset-x-0 bottom-0 h-14 border-b border-foreground/70 bg-gradient-to-b from-transparent to-foreground/[0.06]" />
          </div>
        </div>

        {/* Connectors: pin → the diff line that fixes it */}
        <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {PINS.map((p, i) => {
            const ty = LINES_Y[i];
            const d = `M ${p.anchorX} ${p.anchorY} C ${p.anchorX} ${(p.anchorY + ty) / 2}, 4 ${ty - 6}, 6.5 ${ty}`;
            return (
              <g key={i}>
                <path d={d} fill="none" stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="2 3" />
                <path
                  d={d}
                  fill="none"
                  stroke="var(--tel-emerald)"
                  strokeWidth="1.25"
                  vectorEffect="non-scaling-stroke"
                  pathLength={1}
                  strokeDasharray="1"
                  className={cn("o-hp-wire", `o-hp-wire-${i + 1}`)}
                />
              </g>
            );
          })}
        </svg>

        {/* Leak pins (L3 chips) */}
        {pins.map((label, i) => (
          <div
            key={label}
            className={cn(
              "o-chip absolute flex max-w-[62%] items-center gap-1.5 rounded-lg py-1 pe-2.5 ps-1.5 font-mono text-[10.5px] text-foreground",
              `o-hp-pin o-hp-pin-${i + 1}`,
            )}
            style={PINS[i].side === "start" ? { insetInlineStart: `${PINS[i].x}%`, top: `${PINS[i].y}%` } : { insetInlineEnd: `${PINS[i].x}%`, top: `${PINS[i].y}%` }}
          >
            <span className="relative grid size-3.5 shrink-0 place-items-center">
              <b className="o-hp-before absolute size-1.5 rounded-full bg-tel-rose" />
              <Check className="o-hp-after absolute size-3 text-tel-emerald" strokeWidth={3} />
            </span>
            <span className="truncate">{label}</span>
          </div>
        ))}

        {/* The fix: three added lines in a recessed diff well */}
        <div dir="ltr" className="o-well absolute inset-x-[5%] top-[56%] h-[25.5%] overflow-hidden rounded-xl font-mono text-[10px] leading-none sm:text-[10.5px]">
          <div className="flex items-center justify-between border-b border-edge px-2.5 py-[2.2%] text-faint">
            <span className="truncate">app/layout.tsx</span>
            <span className="shrink-0">
              <span className="text-tel-emerald">+3</span> <span className="text-tel-rose">−0</span>
            </span>
          </div>
          {[
            ['<meta name="description" content="Product analytics…" />', 1],
            ['<a href="/pricing">Pricing</a>', 2],
            ['<script type="application/ld+json">{…}</script>', 3],
          ].map(([code, n]) => (
            <div
              key={n as number}
              className={cn("o-hp-line flex h-[21.5%] items-center gap-2 px-2.5 text-muted-foreground", `o-hp-line-${n}`)}
            >
              <span className="w-2 shrink-0 text-tel-emerald">+</span>
              <span className="truncate">{code}</span>
            </div>
          ))}
        </div>

        {/* Score bridge: 61 / 100 → PR #14 → 94 / 100 */}
        <div className="absolute inset-x-[5%] bottom-[3.5%] flex items-center gap-2">
          <span className="o-readout-strong inline-flex shrink-0 items-baseline gap-1 rounded-lg border border-tel-rose/35 bg-tel-rose/10 px-2.5 py-1.5 text-tel-rose">
            <span className="text-[20px] leading-none">61</span>
            <span className="text-[10px] opacity-80">/ 100</span>
          </span>
          <div className="relative h-6 min-w-0 flex-1">
            <svg className="absolute inset-0 size-full" viewBox="0 0 100 24" preserveAspectRatio="none">
              <path d="M 0 12 L 100 12" stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="2 3" />
              <path d="M 0 12 L 100 12" stroke="var(--tel-sky)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" pathLength={1} strokeDasharray="1" className="o-hp-bridge" />
            </svg>
            <span className="o-hp-pr absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-tel-sky/40 bg-chip px-2 py-0.5 font-mono text-[9.5px] text-tel-sky">
              PR #14
            </span>
          </div>
          <span className="o-hp-score o-readout-strong inline-flex shrink-0 items-baseline gap-1 rounded-lg border border-tel-emerald/40 bg-tel-emerald/10 px-2.5 py-1.5 text-tel-emerald">
            <span className="text-[20px] leading-none">94</span>
            <span className="text-[10px] opacity-80">/ 100</span>
          </span>
        </div>
      </div>
    </div>
  );
}
