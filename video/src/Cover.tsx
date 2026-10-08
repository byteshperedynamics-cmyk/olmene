import { AbsoluteFill } from "remotion";
import { Background } from "./components/Background";
import { Flower } from "./components/Flower";
import "./fonts";
import { C, FONT } from "./theme";

/**
 * TikTok cover (upload it as the custom cover). The profile grid crops covers
 * to 3:4 around the centre, so everything sits between y≈300 and y≈1600.
 */
export const Cover: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: FONT.display, color: C.fg }}>
    <Background />
    <div
      style={{
        position: "absolute",
        left: 540 - 520,
        top: 900 - 330,
        width: 1040,
        height: 660,
        borderRadius: "50%",
        background: "radial-gradient(closest-side, rgba(222,131,84,0.22), transparent)",
      }}
    />
    <div style={{ position: "absolute", top: 420, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 20 }}>
      <Flower size={66} />
      <span style={{ fontWeight: 600, fontSize: 72, letterSpacing: "-0.01em" }}>olmene</span>
    </div>
    <div style={{ position: "absolute", top: 700, left: 60, right: 60, textAlign: "center", fontWeight: 500, fontSize: 128, lineHeight: 1.04, letterSpacing: "-0.012em" }}>
      Your site is
      <br />
      <span style={{ position: "relative", display: "inline-block", fontStyle: "italic", color: C.rust }}>
        losing customers.
        <span style={{ position: "absolute", left: "2%", right: "4%", bottom: -6, height: 10, borderRadius: 6, background: C.rust, opacity: 0.85 }} />
      </span>
    </div>
    <div style={{ position: "absolute", top: 1080, left: 0, right: 0, textAlign: "center", fontWeight: 500, fontSize: 76, letterSpacing: "-0.01em" }}>
      Olmene <em style={{ color: C.leaf }}>ships the fix.</em>
    </div>
  </AbsoluteFill>
);
