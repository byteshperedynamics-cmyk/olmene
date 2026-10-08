import { Easing } from "remotion";

/**
 * Olmene brand tokens for video — the "living instrument" dark theme from
 * docs/design/olmene-blueprint.html. Green means proof: leaf marks agent
 * activity and verified results only, rust marks problems, amber marks
 * example data. Everything else stays neutral.
 */
export const C = {
  bg: "#1A1B19",
  bgDeep: "#121311",
  surface: "#222320",
  surface2: "#2A2B28",
  line: "rgba(245, 244, 239, 0.09)",
  lineStrong: "rgba(245, 244, 239, 0.16)",
  fg: "#F5F4EF",
  muted: "#A3A29C",
  faint: "#96958F",
  leaf: "#69C27E",
  leafInk: "#1A1B19",
  leafSoft: "rgba(105, 194, 126, 0.14)",
  glow: "rgba(105, 194, 126, 0.38)",
  rust: "#DE8354",
  rustSoft: "rgba(222, 131, 84, 0.14)",
  amber: "#D9B45A",
  add: "rgba(105, 194, 126, 0.12)",
  del: "rgba(222, 131, 84, 0.12)",
  grid: "rgba(245, 244, 239, 0.035)",
} as const;

export const FONT = {
  display: "Newsreader, Georgia, 'Times New Roman', serif",
  body: "Inter, ui-sans-serif, system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, Menlo, monospace",
} as const;

/** The brand's one easing curve (ease-out-expo). */
export const EASE = Easing.bezier(0.22, 1, 0.36, 1);
/** Soft overshoot for things that pop (pins, checks, buttons). */
export const POP = Easing.bezier(0.34, 1.56, 0.64, 1);

export const VIDEO = { width: 1080, height: 1920, fps: 30 } as const;

/**
 * TikTok UI overlays the top tabs, the right-hand action column and the
 * caption block at the bottom. Key content stays inside this box.
 */
export const SAFE = { top: 190, bottom: 1460, left: 90, right: 950 } as const;
export const COLUMN = { left: SAFE.left, width: SAFE.right - SAFE.left } as const;

/** Clamp helper shared by every interpolate() call. */
export const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * Transitions overlap neighbouring scenes by this many frames; each visual cut
 * sits in the middle of the overlap, on the beat.
 */
export const OVERLAP = 14;
/** Local frame of a scene at which its cut (the beat) lands. */
export const CUT = OVERLAP / 2;
