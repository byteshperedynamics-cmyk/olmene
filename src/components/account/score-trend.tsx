import { cn } from "@/lib/utils";

/**
 * Weekly readiness scores as one line (0–100), drawn once on arrival. A
 * dashed hairline marks 75, where a site counts as in good shape. The last
 * point carries the score's band colour; everything else stays achromatic.
 * The line stretches to any width; the dot and label are HTML so they never
 * distort.
 */
export function ScoreTrend({
  history,
  height = 120,
  className,
  goodLabel,
  label,
  fit = false,
}: {
  history: { at: string; score: number }[];
  height?: number;
  className?: string;
  /** Text above the 75 line, e.g. "Good". */
  goodLabel?: string;
  /** Accessible summary, e.g. "Score went from 48 to 79 over 6 weeks". */
  label: string;
  /** Sparkline mode: scale to the scores' own range (at least 20 points tall) instead of 0–100. */
  fit?: boolean;
}) {
  const W = 600;
  const H = height;
  const padY = fit ? 6 : 10;
  const scores = history.map((h) => h.score);
  let lo = 0;
  let hi = 100;
  if (fit && scores.length) {
    lo = Math.max(0, Math.min(...scores) - 6);
    hi = Math.min(100, Math.max(...scores) + 6);
    if (hi - lo < 20) {
      const mid = (hi + lo) / 2;
      lo = Math.max(0, mid - 10);
      hi = Math.min(100, lo + 20);
    }
  }
  const y = (s: number) => padY + (1 - (s - lo) / (hi - lo)) * (H - padY * 2);
  const showGood = 75 >= lo && 75 <= hi;
  const pts = history.length === 1 ? [history[0], history[0]] : history;
  const xPct = (i: number) => (pts.length <= 1 ? 50 : (i / (pts.length - 1)) * 100);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${((xPct(i) / 100) * W).toFixed(1)} ${y(p.score).toFixed(1)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const last = pts.at(-1);
  const tone = !last ? "" : last.score >= 75 ? "bg-tel-emerald" : last.score >= 50 ? "bg-tel-amber" : "bg-tel-rose";

  return (
    <div role="img" aria-label={label} className={cn("relative w-full text-foreground", className)} style={{ height: H }} dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden className="absolute inset-0 size-full overflow-visible">
        <defs>
          <linearGradient id="o-trend-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.14" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {showGood && <line x1="0" x2={W} y1={y(75)} y2={y(75)} stroke="var(--rim)" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />}
        {pts.length > 0 && (
          <>
            <path d={area} fill="url(#o-trend-fill)" />
            <path
              d={line}
              pathLength={1}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className="o-trend-line"
            />
          </>
        )}
      </svg>
      {goodLabel && showGood && (
        <span aria-hidden className="absolute start-0 -translate-y-full pb-1 text-[11px] leading-none text-muted-foreground" style={{ top: y(75) }}>
          {goodLabel}
        </span>
      )}
      {last && (
        <span
          aria-hidden
          className={cn("o-trend-dot absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background", tone)}
          style={{ left: `${xPct(pts.length - 1)}%`, top: y(last.score) }}
        />
      )}
    </div>
  );
}
