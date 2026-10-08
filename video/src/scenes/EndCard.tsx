import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Flower } from "../components/Flower";
import { Headline } from "../components/Headline";
import { ArrowIcon } from "../components/Icons";
import { Sfx } from "../components/Sfx";
import "../fonts";
import { C, CLAMP, EASE, FONT, POP } from "../theme";

const BLOOM = 0;
const CTA = 80;
const TAGLINE = [
  { text: "Find it.", at: 37 },
  { text: "Fix it.", at: 52 },
  { text: "Prove it.", at: 67 },
];

/** 0:21 — the end card: the mark blooms, the loop as a tagline, one clear URL. */
export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const word = interpolate(frame, [BLOOM + 10, BLOOM + 30], [0, 1], { ...CLAMP, easing: EASE });
  const cta = interpolate(frame, [CTA, CTA + 14], [0, 1], { ...CLAMP, easing: POP });
  const sheen = ((frame - CTA - 10) % 50) / 50;

  return (
    <AbsoluteFill style={{ fontFamily: FONT.body }}>
      {/* lockup */}
      <div
        style={{
          position: "absolute",
          top: 560,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 30,
          scale: `${interpolate(frame, [0, 157], [0.98, 1.03])}`,
        }}
      >
        <div style={{ position: "relative", width: 168, height: 168 }}>
          <div
            style={{
              position: "absolute",
              inset: -70,
              borderRadius: "50%",
              background: `radial-gradient(closest-side, ${C.glow}, transparent)`,
              opacity: interpolate(frame, [BLOOM, BLOOM + 20], [0, 0.9], CLAMP) * (0.75 + 0.25 * Math.sin(frame / 9)),
            }}
          />
          <Flower size={168} bloomAt={BLOOM} breathe={interpolate(frame, [BLOOM + 30, BLOOM + 50], [0, 1], CLAMP)} spin={interpolate(frame, [BLOOM, BLOOM + 40], [-40, 0], { ...CLAMP, easing: EASE })} />
        </div>
        <div style={{ overflow: "hidden", padding: "10px 12px 26px", margin: "-10px -12px -26px" }}>
          <div
            style={{
              fontFamily: FONT.display,
              fontWeight: 600,
              fontSize: 170,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: C.fg,
              translate: `${(1 - word) * -60}% 0`,
              opacity: word,
            }}
          >
            olmene
          </div>
        </div>
      </div>

      {/* the loop, one phrase per beat */}
      <div
        style={{
          position: "absolute",
          top: 820,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 26,
          fontFamily: FONT.display,
          fontWeight: 500,
          fontSize: 68,
          letterSpacing: "-0.01em",
        }}
      >
        {TAGLINE.map((t, i) => {
          const p = interpolate(frame, [t.at, t.at + 14], [0, 1], { ...CLAMP, easing: EASE });
          return (
            <span
              key={t.text}
              style={{
                color: i === 2 ? C.leaf : C.fg,
                fontStyle: i === 2 ? "italic" : "normal",
                opacity: p,
                translate: `0 ${(1 - p) * 40}px`,
                filter: `blur(${(1 - p) * 8}px)`,
              }}
            >
              {t.text}
            </span>
          );
        })}
      </div>

      {/* call to action */}
      <div
        style={{
          position: "absolute",
          top: 1000,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          opacity: interpolate(frame, [CTA, CTA + 4], [0, 1], CLAMP),
          scale: `${0.85 + 0.15 * cta}`,
        }}
      >
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            gap: 20,
            height: 128,
            padding: "0 60px",
            borderRadius: 32,
            background: C.leaf,
            color: C.leafInk,
            fontSize: 60,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            boxShadow: `0 24px 70px -18px ${C.glow}, 0 0 0 10px rgba(105,194,126,0.12)`,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%)",
              translate: `${interpolate(sheen, [0, 0.6, 1], [-120, 120, 120])}% 0`,
              opacity: frame > CTA + 10 ? 1 : 0,
            }}
          />
          <span style={{ position: "relative" }}>olmene.com</span>
          <span style={{ position: "relative", display: "grid" }}>
            <ArrowIcon size={58} stroke={2.6} />
          </span>
        </div>
      </div>

      <Headline
        segs={[{ text: "Free scan · 30 seconds · No card" }]}
        at={CTA + 12}
        stagger={2}
        size={34}
        top={1176}
        style={{ fontFamily: FONT.mono, fontWeight: 400, letterSpacing: "0.02em", color: C.muted }}
      />

      <Sfx name="bloom" at={BLOOM} volume={0.8} />
      {TAGLINE.map((t) => (
        <Sfx key={t.text} name="tick" at={t.at} volume={0.45} />
      ))}
      <Sfx name="pop" at={CTA} volume={0.7} />
    </AbsoluteFill>
  );
};
