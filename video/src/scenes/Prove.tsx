import { AbsoluteFill, interpolate, interpolateColors, useCurrentFrame } from "remotion";
import { Headline } from "../components/Headline";
import { CheckIcon, CrossIcon } from "../components/Icons";
import { Sfx } from "../components/Sfx";
import { Pill, PulseDot } from "../components/ui";
import "../fonts";
import { C, CLAMP, EASE, FONT, POP } from "../theme";

const DIAL = { x: 540, y: 868, r: 196, stroke: 22 };
const BEFORE = 61;
const STEP = 11; // each verified fix moves the score: 61 → 72 → 83 → 94

const CHECKS = [
  { label: "Page title", fixAt: 40, sfx: "ding1" as const },
  { label: "Meta description", fixAt: 48, sfx: "ding2" as const },
  { label: "JSON-LD for AI search", fixAt: 56, sfx: "ding3" as const },
];

/**
 * 0:17 — "Then it proves it worked.": after the merge Olmene re-checks the
 * live site; the readiness score moves 61 → 94 (the site's own example
 * numbers, labelled as such) and each finding turns green.
 */
export const Prove: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 16], [0, 1], { ...CLAMP, easing: EASE });
  // The ring draws the "before" score, then climbs one step per verified fix.
  const arc = interpolate(frame, [10, 28], [0, BEFORE], { ...CLAMP, easing: EASE });
  const climb = CHECKS.reduce(
    (sum, c) => sum + STEP * interpolate(frame, [c.fixAt, c.fixAt + 10], [0, 1], { ...CLAMP, easing: EASE }),
    0,
  );
  const score = BEFORE + climb;
  const ring = arc + climb;
  const doneAt = CHECKS[CHECKS.length - 1].fixAt + 10;
  const done = interpolate(frame, [doneAt, doneAt + 10], [0, 1], { ...CLAMP, easing: POP });
  const color = interpolateColors(score, [BEFORE, 80, 94], [C.rust, C.amber, C.leaf]);
  const circumference = 2 * Math.PI * DIAL.r;
  const burst = interpolate(frame, [doneAt, doneAt + 24], [0, 1], { ...CLAMP, easing: EASE });

  return (
    <AbsoluteFill style={{ fontFamily: FONT.body, scale: `${interpolate(frame, [0, 134], [1, 1.03])}` }}>
      <Headline segs={[{ text: "Then it proves", br: true }, { text: "it worked.", tone: "leaf", italic: true }]} at={0} top={250} />

      {/* status pills */}
      <div style={{ position: "absolute", top: 572, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 16, opacity: enter }}>
        <Pill tone="leaf" size={24}>
          {done > 0.5 ? <CheckIcon size={26} /> : <PulseDot color={C.leaf} size={13} period={24} />}
          {done > 0.5 ? "Fixes confirmed live" : "Re-checking your live site"}
        </Pill>
        <Pill tone="amber" caps size={20}>
          Example
        </Pill>
      </div>

      {/* readiness dial */}
      <div
        style={{
          position: "absolute",
          left: DIAL.x - DIAL.r - 40,
          top: DIAL.y - DIAL.r - 40,
          width: (DIAL.r + 40) * 2,
          height: (DIAL.r + 40) * 2,
          opacity: enter,
          scale: `${0.88 + 0.12 * enter}`,
        }}
      >
        {/* success bloom */}
        <div
          style={{
            position: "absolute",
            inset: -60,
            borderRadius: "50%",
            background: `radial-gradient(closest-side, ${C.glow}, transparent)`,
            opacity: burst * (1 - burst * 0.55),
            scale: `${0.7 + burst * 0.5}`,
          }}
        />
        <svg width="100%" height="100%" viewBox={`${-DIAL.r - 40} ${-DIAL.r - 40} ${(DIAL.r + 40) * 2} ${(DIAL.r + 40) * 2}`}>
          <circle r={DIAL.r} fill="rgba(34,35,32,0.85)" stroke={C.lineStrong} strokeWidth={DIAL.stroke} />
          <circle
            r={DIAL.r}
            fill="none"
            stroke={color}
            strokeWidth={DIAL.stroke}
            strokeLinecap="round"
            strokeDasharray={`${(ring / 100) * circumference} ${circumference}`}
            transform="rotate(-90)"
            style={{ filter: `drop-shadow(0 0 ${8 + done * 10}px ${done > 0 ? C.glow : "transparent"})` }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: FONT.mono, fontSize: 24, letterSpacing: "0.14em", color: C.faint }}>READINESS</span>
          <span
            style={{
              fontFamily: FONT.display,
              fontSize: 190,
              lineHeight: 1,
              fontWeight: 500,
              color,
              fontVariantNumeric: "tabular-nums",
              scale: `${1 + Math.sin(done * Math.PI) * 0.08}`,
              marginTop: 4,
            }}
          >
            {Math.round(score)}
          </span>
          <span style={{ fontFamily: FONT.mono, fontSize: 26, color: C.faint }}>/ 100</span>
        </div>
        {/* delta badge */}
        <div style={{ position: "absolute", right: 6, top: 40, opacity: interpolate(frame, [doneAt, doneAt + 4], [0, 1], CLAMP), scale: `${0.5 + 0.5 * done}` }}>
          <Pill tone="leaf" size={26} style={{ background: C.leaf, color: C.leafInk, fontWeight: 600 }}>
            +33
          </Pill>
        </div>
      </div>

      {/* findings, re-checked one by one */}
      <div style={{ position: "absolute", top: 1124, left: 170, width: 740, display: "flex", flexDirection: "column", gap: 10 }}>
        {CHECKS.map((c, i) => {
          const show = interpolate(frame, [12 + i * 4, 22 + i * 4], [0, 1], { ...CLAMP, easing: EASE });
          const fixed = interpolate(frame, [c.fixAt, c.fixAt + 8], [0, 1], { ...CLAMP, easing: EASE });
          return (
            <div
              key={c.label}
              style={{
                height: 72,
                display: "flex",
                alignItems: "center",
                gap: 22,
                padding: "0 24px",
                borderRadius: 18,
                background: fixed > 0.5 ? "rgba(105,194,126,0.08)" : "rgba(245,244,239,0.04)",
                border: `2px solid ${fixed > 0.5 ? "rgba(105,194,126,0.3)" : C.line}`,
                opacity: show,
                translate: `0 ${(1 - show) * 20}px`,
              }}
            >
              <div style={{ position: "relative", width: 38, height: 38, flex: "none" }}>
                <div style={{ position: "absolute", inset: 0, opacity: 1 - fixed, display: "grid", placeItems: "center" }}>
                  <CrossIcon size={32} />
                </div>
                <div style={{ position: "absolute", inset: 0, opacity: fixed, display: "grid", placeItems: "center" }}>
                  <CheckIcon size={38} draw={fixed} stroke={3.2} />
                </div>
              </div>
              <span style={{ flex: 1, fontSize: 33, color: interpolateColors(fixed, [0, 1], [C.muted, C.fg]) }}>{c.label}</span>
              <span style={{ fontFamily: FONT.mono, fontSize: 24, color: C.leaf, opacity: fixed, letterSpacing: "0.08em" }}>LIVE</span>
            </div>
          );
        })}
      </div>

      <Sfx name="riser" at={CHECKS[0].fixAt - 4} volume={0.45} />
      {CHECKS.map((c) => (
        <Sfx key={c.label} name={c.sfx} at={c.fixAt} volume={0.5} />
      ))}
      <Sfx name="chime" at={doneAt} volume={0.55} />
    </AbsoluteFill>
  );
};
