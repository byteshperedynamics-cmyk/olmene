import { interpolate, useCurrentFrame } from "remotion";
import { C, CLAMP, EASE, FONT, POP } from "../theme";
import { CheckIcon } from "./Icons";

/** Surface card in the blueprint's .device style. */
export const card: React.CSSProperties = {
  position: "absolute",
  background: C.surface,
  border: `2px solid ${C.lineStrong}`,
  borderRadius: 32,
  boxShadow: "0 50px 120px -40px rgba(0,0,0,0.75), 0 0 0 10px rgba(34,35,32,0.45)",
  overflow: "hidden",
};

const PILL_TONE = {
  amber: { color: C.amber, background: "transparent", border: "rgba(217,180,90,0.45)" },
  leaf: { color: C.leaf, background: C.leafSoft, border: "transparent" },
  rust: { color: C.rust, background: C.rustSoft, border: "transparent" },
  neutral: { color: C.muted, background: C.surface2, border: "transparent" },
} as const;

/** Mono tag — amber outline marks example data, as on the site. */
export const Pill: React.FC<{
  tone: keyof typeof PILL_TONE;
  children: React.ReactNode;
  size?: number;
  caps?: boolean;
  style?: React.CSSProperties;
}> = ({ tone, children, size = 22, caps = false, style }) => {
  const t = PILL_TONE[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        fontFamily: FONT.mono,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: caps ? "0.12em" : "0.02em",
        textTransform: caps ? "uppercase" : "none",
        padding: `${size * 0.42}px ${size * 0.7}px`,
        borderRadius: 999,
        whiteSpace: "nowrap",
        color: t.color,
        background: t.background,
        border: `2px solid ${t.border}`,
        ...style,
      }}
    >
      {children}
    </span>
  );
};

/** A dot with the site's expanding pulse ring (o-pulse-dot), frame-driven. */
export const PulseDot: React.FC<{ color: string; size?: number; period?: number }> = ({ color, size = 14, period = 54 }) => {
  const frame = useCurrentFrame();
  const t = (frame % period) / period;
  return (
    <span style={{ position: "relative", display: "inline-block", width: size, height: size, flex: "none" }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color }} />
      <span
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: `2px solid ${color}`,
          scale: `${1 + t * 1.8}`,
          opacity: 0.7 * (1 - t),
        }}
      />
    </span>
  );
};

/**
 * Issue pin — rust dot + finding, popping in at `at`. With `fixedAt` the dot
 * turns into a leaf check: the finding has been fixed and verified.
 */
export const Pin: React.FC<{
  label: string;
  at: number;
  fixedAt?: number;
  size?: number;
  tilt?: number;
  style?: React.CSSProperties;
}> = ({ label, at, fixedAt, size = 30, tilt = 0, style }) => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [at, at + 12], [0, 1], { ...CLAMP, easing: POP });
  const fade = interpolate(frame, [at, at + 5], [0, 1], CLAMP);
  const fixed = fixedAt === undefined ? 0 : interpolate(frame, [fixedAt, fixedAt + 10], [0, 1], { ...CLAMP, easing: EASE });
  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        alignItems: "center",
        gap: size * 0.45,
        padding: `${size * 0.5}px ${size * 0.8}px ${size * 0.5}px ${size * 0.55}px`,
        borderRadius: size * 0.6,
        background: "#1F201D",
        border: `2px solid ${fixed > 0.5 ? "rgba(105,194,126,0.45)" : C.lineStrong}`,
        boxShadow: "0 18px 40px -10px rgba(0,0,0,0.6)",
        fontFamily: FONT.mono,
        fontSize: size,
        lineHeight: 1,
        color: C.fg,
        whiteSpace: "nowrap",
        opacity: fade,
        scale: `${0.55 + 0.45 * enter}`,
        translate: `0 ${(1 - enter) * 18}px`,
        rotate: `${tilt}deg`,
        ...style,
      }}
    >
      <span style={{ position: "relative", width: size * 0.8, height: size * 0.8, display: "grid", placeItems: "center", flex: "none" }}>
        <span style={{ position: "absolute", opacity: 1 - fixed, display: "grid", placeItems: "center" }}>
          <PulseDot color={C.rust} size={size * 0.42} />
        </span>
        <span style={{ position: "absolute", opacity: fixed, display: "grid", placeItems: "center" }}>
          <CheckIcon size={size * 0.85} draw={fixed} stroke={3.4} />
        </span>
      </span>
      <span>{label}</span>
    </div>
  );
};
