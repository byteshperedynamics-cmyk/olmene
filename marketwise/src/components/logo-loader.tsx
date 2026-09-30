import { cn } from "@/lib/utils";
import { AnimatedFlower } from "@/components/animated-flower";

/**
 * Claude-style "thinking" indicator: the Marketwise flower mark in its living
 * form — petals blooming on staggered phases, the bloom drifting slowly,
 * with an optional soft terracotta glow. Calm, never a spin.
 */
export function LogoLoader({
  size = 20,
  glow = false,
  className,
}: {
  size?: number;
  glow?: boolean;
  className?: string;
}) {
  return (
    <AnimatedFlower
      size={size}
      glow={glow}
      className={cn("text-primary", className)}
    />
  );
}

/** Shimmering status text — the gentle highlight sweep Claude uses while thinking. */
export function ShimmerText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "animate-text-shimmer bg-gradient-to-r from-muted-foreground via-foreground to-muted-foreground bg-[length:200%_100%] bg-clip-text text-transparent",
        className,
      )}
    >
      {children}
    </span>
  );
}
