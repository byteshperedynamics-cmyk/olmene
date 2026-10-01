import { PETAL_D } from "@/components/animated-flower";
import { cn } from "@/lib/utils";

/**
 * Flower — the Olmene mark, as the agent's heartbeat.
 *
 *  static     — the logo, no motion
 *  breathe    — the agent is working (whole mark swells, 3.2s)
 *  bloom      — ambient: petals open and close on staggered phases
 *  bloom-once — a single settle (completion moments; replaces confetti)
 *
 * Decorative only (aria-hidden). Color comes from currentColor.
 */
export type FlowerVariant = "static" | "breathe" | "bloom" | "bloom-once";

export function Flower({
  size = 24,
  variant = "static",
  className,
}: {
  size?: number;
  variant?: FlowerVariant;
  className?: string;
}) {
  return (
    <svg
      viewBox="-263 -263 526 526"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className={cn(
        "shrink-0 text-primary",
        variant === "breathe" && "animate-logo-breathe",
        variant === "bloom-once" && "o-bloom-once",
        className,
      )}
    >
      {[0, 1, 2, 3, 4].map((k) => (
        <g key={k} transform={`rotate(${k * 72})`}>
          <path
            d={PETAL_D}
            fill="currentColor"
            className={variant === "bloom" ? "flower-petal" : undefined}
            style={variant === "bloom" ? { animationDelay: `${-k * 0.64}s` } : undefined}
          />
        </g>
      ))}
    </svg>
  );
}
