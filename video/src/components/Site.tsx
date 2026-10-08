import { C, FONT } from "../theme";

const bar = (w: number | string, h: number, extra?: React.CSSProperties): React.CSSProperties => ({
  width: w,
  height: h,
  borderRadius: Math.min(10, h / 2.5),
  background: "rgba(245,244,239,0.085)",
  flex: "none",
  ...extra,
});

/** Wireframe of the customer's site — the shape of the site's ScanPreview, scaled for video. */
export const SiteWireframe: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div style={{ position: "absolute", inset: 0, padding: "40px 40px", display: "flex", flexDirection: "column", ...style }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={bar(130, 24)} />
      <div style={{ display: "flex", gap: 16 }}>
        <div style={bar(64, 16)} />
        <div style={bar(64, 16)} />
        <div style={bar(92, 16, { background: "rgba(105,194,126,0.28)" })} />
      </div>
    </div>
    <div style={bar("64%", 40, { marginTop: 46 })} />
    <div style={bar("44%", 40, { marginTop: 16 })} />
    <div style={bar("52%", 18, { marginTop: 22, opacity: 0.7 })} />
    <div style={{ display: "flex", gap: 16, marginTop: 28 }}>
      <div style={bar(180, 56, { borderRadius: 14, background: "rgba(105,194,126,0.30)" })} />
      <div style={bar(150, 56, { borderRadius: 14, background: "transparent", border: `2px solid ${C.lineStrong}` })} />
    </div>
    <div
      style={{
        marginTop: 30,
        height: 116,
        borderRadius: 18,
        border: `2px solid ${C.lineStrong}`,
        backgroundColor: "rgba(245,244,239,0.04)",
        backgroundImage: `linear-gradient(135deg, rgba(245,244,239,0.05), ${C.leafSoft}), linear-gradient(${C.grid} 2px, transparent 2px), linear-gradient(90deg, ${C.grid} 2px, transparent 2px)`,
        backgroundSize: "100% 100%, 26px 26px, 26px 26px",
        flex: "none",
      }}
    />
    <div style={{ display: "flex", gap: 18, marginTop: 28 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: 112,
            borderRadius: 14,
            background: "rgba(245,244,239,0.055)",
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={bar(20, 20, { borderRadius: 10, background: C.lineStrong })} />
          <div style={bar("80%", 12)} />
          <div style={bar("55%", 12, { opacity: 0.7 })} />
        </div>
      ))}
    </div>
  </div>
);

/** Three traffic-light dots of the browser chrome. */
export const Dots: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div style={{ display: "flex", gap: 12, ...style }}>
    {[0, 1, 2].map((i) => (
      <i key={i} style={{ width: 18, height: 18, borderRadius: "50%", background: C.lineStrong, display: "block" }} />
    ))}
  </div>
);

/** A small URL readout in the chrome. */
export const UrlText: React.FC<{ text: string; size: number; caret?: boolean }> = ({ text, size, caret }) => (
  <span style={{ fontFamily: FONT.mono, fontSize: size, color: C.fg, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center" }}>
    {text}
    {caret ? <i style={{ display: "inline-block", width: 3, height: size * 1.1, background: C.leaf, marginLeft: 4 }} /> : null}
  </span>
);
