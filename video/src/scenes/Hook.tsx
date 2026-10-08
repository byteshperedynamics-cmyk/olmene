import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Flower } from "../components/Flower";
import { Headline } from "../components/Headline";
import { Sfx } from "../components/Sfx";
import { Dots, SiteWireframe, UrlText } from "../components/Site";
import { Pin } from "../components/ui";
import "../fonts";
import { C, CLAMP, EASE, FONT } from "../theme";

const SLAM = 10;

/**
 * 0:00 — the hook. The site's own H1 promise, problem first: the line is
 * readable on the very first frame, "losing customers." lands on an impact
 * and three real findings pop in around it, over a ghost of the site.
 */
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();

  const slam = interpolate(frame, [SLAM, SLAM + 9], [0, 1], { ...CLAMP, easing: EASE });
  // A short, decaying camera shake on the impact.
  const shake = frame >= SLAM ? interpolate(frame, [SLAM, SLAM + 10], [1, 0], CLAMP) : 0;
  const underline = interpolate(frame, [SLAM + 8, SLAM + 22], [0, 1], { ...CLAMP, easing: EASE });
  const flash = interpolate(frame, [SLAM, SLAM + 4, SLAM + 30], [0, 0.6, 0.22], CLAMP);

  return (
    <AbsoluteFill style={{ fontFamily: FONT.body }}>
      {/* ghost of the customer's site, tilted away in 3D */}
      <div
        style={{
          position: "absolute",
          left: 130,
          top: 610,
          width: 820,
          height: 1040,
          borderRadius: 34,
          border: `2px solid ${C.lineStrong}`,
          background: "rgba(34,35,32,0.7)",
          overflow: "hidden",
          opacity: interpolate(frame, [0, 20], [0.3, 0.55], CLAMP),
          transform: `perspective(2200px) rotateX(${interpolate(frame, [0, 97], [30, 24])}deg) rotateZ(${interpolate(frame, [0, 97], [-8, -5])}deg) translateY(${interpolate(frame, [0, 97], [30, -20])}px)`,
        }}
      >
        <div style={{ height: 90, display: "flex", alignItems: "center", gap: 26, padding: "0 30px", borderBottom: `2px solid ${C.line}` }}>
          <Dots />
          <UrlText text="acme-analytics.com" size={28} />
        </div>
        <div style={{ position: "absolute", top: 90, left: 0, right: 0, bottom: 0 }}>
          <SiteWireframe />
        </div>
      </div>

      {/* small lockup — present from the first frame, never shouting */}
      <div
        style={{
          position: "absolute",
          top: 214,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 16,
        }}
      >
        <Flower size={46} breathe={1} />
        <span style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 50, color: C.fg, letterSpacing: "-0.01em" }}>olmene</span>
      </div>

      <AbsoluteFill
        style={{
          translate: `${Math.sin(frame * 2.9) * 10 * shake}px ${Math.cos(frame * 3.7) * 6 * shake}px`,
          scale: `${interpolate(frame, [0, 97], [1, 1.035])}`,
        }}
      >
        {/* dark scrim keeps the headline crisp over the ghost site */}
        <div
          style={{
            position: "absolute",
            left: 540 - 560,
            top: 860 - 290,
            width: 1120,
            height: 580,
            borderRadius: "50%",
            background: "radial-gradient(closest-side, rgba(22,23,21,0.92) 55%, transparent)",
          }}
        />
        {/* rust light behind the problem */}
        <div
          style={{
            position: "absolute",
            left: 540 - 520,
            top: 905 - 300,
            width: 1040,
            height: 600,
            borderRadius: "50%",
            background: "radial-gradient(closest-side, rgba(222,131,84,0.30), transparent)",
            opacity: flash,
          }}
        />

        <Headline segs={[{ text: "Your site is" }]} at={-9} stagger={3} size={118} top={726} />

        {/* "losing customers." slams in */}
        <div
          style={{
            position: "absolute",
            top: 849,
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: FONT.display,
            fontStyle: "italic",
            fontWeight: 500,
            fontSize: 118,
            lineHeight: 1.04,
            letterSpacing: "-0.012em",
            color: C.rust,
            opacity: interpolate(frame, [SLAM, SLAM + 3], [0, 1], CLAMP),
            scale: `${interpolate(slam, [0, 1], [1.45, 1])}`,
            filter: `blur(${(1 - slam) * 16}px)`,
          }}
        >
          <span style={{ position: "relative", display: "inline-block" }}>
            losing customers.
            <span
              style={{
                position: "absolute",
                left: "2%",
                right: "4%",
                bottom: -6,
                height: 9,
                borderRadius: 6,
                background: C.rust,
                opacity: 0.85,
                scale: `${underline} 1`,
                transformOrigin: "0 50%",
              }}
            />
          </span>
        </div>

        <Pin label="No meta description" at={24} size={34} tilt={-4} style={{ left: 120, top: 548 }} />
        <Pin label="Generic page title" at={33} size={34} tilt={3} style={{ left: 466, top: 1046 }} />
        <Pin label="Unreadable to AI search" at={42} size={34} tilt={-2} style={{ left: 150, top: 1172 }} />
      </AbsoluteFill>

      <Sfx name="impact" at={SLAM} volume={0.9} />
      <Sfx name="alert" at={24} volume={0.5} />
      <Sfx name="alert" at={33} volume={0.5} />
      <Sfx name="alert" at={42} volume={0.5} />
    </AbsoluteFill>
  );
};
