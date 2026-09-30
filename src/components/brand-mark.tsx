import { PETAL_D } from "@/components/animated-flower";

/**
 * BrandMark — the static five-petal elm flower, no motion.
 *
 * Inline SVG (not a raster) so it stays crisp at any size, inherits
 * `currentColor`, and costs zero image requests. Use `text-primary` /
 * `text-foreground` on the element to color it.
 */
export function BrandMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="-263 -263 526 526"
      width={size}
      height={size}
      className={className}
      aria-hidden
      focusable="false"
    >
      {[0, 1, 2, 3, 4].map((k) => (
        <g key={k} transform={`rotate(${k * 72})`}>
          <path d={PETAL_D} fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}
