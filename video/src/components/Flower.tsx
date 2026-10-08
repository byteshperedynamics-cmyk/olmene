import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, CLAMP, EASE } from "../theme";

/** One petal of the Olmene mark — the same path as src/components/animated-flower.tsx. */
export const PETAL_D =
  "M-64.4 -63.9 C-67.3 -69.0 -77.2 -85.4 -81.4 -94.4 C-85.6 -103.5 -87.9 -110.7 -89.8 -118.1 C-91.7 -125.5 -92.6 -132.5 -92.8 -138.9 C-93.0 -145.2 -92.3 -150.4 -91.1 -156.2 C-89.9 -162.0 -88.2 -168.0 -85.6 -173.5 C-83.0 -179.1 -79.7 -184.6 -75.7 -189.6 C-71.6 -194.6 -66.8 -199.6 -61.2 -203.5 C-55.7 -207.3 -48.6 -210.5 -42.3 -212.7 C-36.0 -214.8 -30.9 -216.2 -23.7 -216.4 C-16.5 -216.6 -6.2 -215.7 0.9 -213.8 C8.0 -212.0 12.8 -209.5 18.9 -205.3 C25.0 -201.1 33.0 -193.7 37.5 -188.6 C42.1 -183.6 43.6 -180.7 46.1 -175.0 C48.6 -169.3 51.3 -162.1 52.4 -154.3 C53.5 -146.6 53.6 -137.2 52.7 -128.8 C51.8 -120.4 47.9 -108.3 46.9 -104.2 L46.9 -104.2 C37.7 -88.6 14.1 -10.1 -8.2 -10.7 C-30.4 -11.3 -75.3 -95.7 -86.5 -107.8 C-97.7 -119.8 -84.7 -95.8 -75.2 -82.8 C-65.7 -69.8 -31.4 -33.0 -29.6 -29.8 C-27.8 -26.7 -58.6 -58.2 -64.4 -63.9 Z";

/**
 * The flower is the agent's heartbeat: it breathes while Olmene works.
 *
 * bloomAt — local frame where the petals unfold into place (staggered);
 *           omit for a mark that is already open.
 * breathe — 0..1 amplitude of the ambient petal bloom (the site's 3.2 s cycle).
 */
export const Flower: React.FC<{
  size: number;
  color?: string;
  bloomAt?: number;
  breathe?: number;
  spin?: number;
  style?: React.CSSProperties;
}> = ({ size, color = C.leaf, bloomAt, breathe = 0, spin = 0, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  return (
    <svg viewBox="-263 -263 526 526" width={size} height={size} style={{ overflow: "visible", ...style }}>
      <g transform={`rotate(${spin})`}>
        {[0, 1, 2, 3, 4].map((k) => {
          const open =
            bloomAt === undefined ? 1 : interpolate(frame, [bloomAt + k * 3, bloomAt + k * 3 + 22], [0, 1], { ...CLAMP, easing: EASE });
          // Ambient bloom: each petal fans ~12deg and eases back, phase-staggered.
          const wave = breathe * (0.5 - 0.5 * Math.cos(2 * Math.PI * (t / 3.2 - k * 0.2)));
          const rotate = (1 - open) * -70 + wave * 12;
          const scale = open * (1 - wave * 0.17);
          return (
            <g key={k} transform={`rotate(${k * 72})`}>
              <path d={PETAL_D} fill={color} opacity={open} transform={`rotate(${rotate}) scale(${scale})`} />
            </g>
          );
        })}
      </g>
    </svg>
  );
};
