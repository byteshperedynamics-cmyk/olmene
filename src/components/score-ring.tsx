import { scoreTone } from "@/lib/format";

/**
 * ScoreRing — ring gauge with the value centered inside and the caption
 * rendered BELOW the ring (never inside it). The bottom of a circle is where
 * the chord narrows, so any in-ring caption wider than ~70% of the diameter
 * collides with the stroke arc — the caption therefore lives outside, where
 * it can wrap freely at any viewport.
 */
export function ScoreRing({ value, size = 96, label }: { value: number; size?: number; label?: string }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  const numClass = size >= 108 ? "text-[1.75rem]" : "text-2xl";
  return (
    <figure className="inline-flex flex-col items-center gap-3.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={8} className="fill-none stroke-muted" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={off}
            className={`fill-none transition-[stroke-dashoffset] duration-700 ${
              value >= 75 ? "stroke-score-good" : value >= 50 ? "stroke-score-mid" : "stroke-score-bad"
            }`}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className={`font-display font-bold leading-none tabular-nums ${numClass} ${scoreTone(value)}`}>
            {value}
          </span>
        </div>
      </div>
      {label ? (
        <figcaption className="max-w-[10rem] text-center text-[10px] uppercase leading-snug tracking-[0.12em] text-muted-foreground">
          {label}
        </figcaption>
      ) : null}
    </figure>
  );
}

export function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className={`font-display text-sm font-semibold tabular-nums ${scoreTone(value)}`}>{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${
            value >= 75 ? "bg-score-good" : value >= 50 ? "bg-score-mid" : "bg-score-bad"
          }`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}
