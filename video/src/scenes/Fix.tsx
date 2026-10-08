import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Flower } from "../components/Flower";
import { Headline } from "../components/Headline";
import { CheckIcon } from "../components/Icons";
import { Sfx } from "../components/Sfx";
import { card, Pill } from "../components/ui";
import "../fonts";
import { C, CLAMP, EASE, FONT } from "../theme";
import { DUR, sceneBeats } from "../timeline";

const b = sceneBeats("fix");

type Row =
  | { kind: "ctx"; n: number; code: string; at: number }
  | { kind: "del"; n: number; code: string; at: number }
  | { kind: "add"; n: number; code: string; at: number; to: number }
  | { kind: "gap"; at: number };

/**
 * The diff the agent writes — the same three fixes the hook found: a real
 * title, a meta description and Organization JSON-LD for AI search. This is
 * the shape of what the title, meta-description and JSON-LD fixers emit
 * (src/lib/v2/sample-data.ts), shortened to read on a phone.
 */
const ROWS: Row[] = [
  { kind: "ctx", n: 12, code: "export const metadata = {", at: b(0.5) },
  { kind: "del", n: 13, code: '  title: "Acme",', at: b(1) },
  { kind: "add", n: 13, code: '  title: "Acme — Product analytics",', at: b(1.5), to: b(2.25) },
  { kind: "add", n: 14, code: '  description: "Find where users drop off.",', at: b(2), to: b(3) },
  { kind: "ctx", n: 15, code: "};", at: b(2.75) },
  { kind: "gap", at: b(3) },
  { kind: "ctx", n: 30, code: "      {children}", at: b(3.25) },
  { kind: "add", n: 31, code: "      <OlmeneJsonLd />", at: b(3.5), to: b(4) },
];

const READY = b(4.5);
const ROW_H = 50;

const DiffRow: React.FC<{ row: Row }> = ({ row }) => {
  const frame = useCurrentFrame();
  const show = interpolate(frame, [row.at, row.at + 6], [0, 1], { ...CLAMP, easing: EASE });

  if (row.kind === "gap") {
    return (
      <div style={{ height: 34, display: "flex", alignItems: "center", paddingLeft: 30, opacity: show * 0.7 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 22, color: C.faint, letterSpacing: "0.1em" }}>@@ app/layout.tsx · line 30 @@</span>
      </div>
    );
  }

  const isAdd = row.kind === "add";
  const isDel = row.kind === "del";
  const typed = isAdd ? Math.round(interpolate(frame, [row.at, row.to], [0, row.code.length], CLAMP)) : row.code.length;
  const typing = isAdd && frame >= row.at && frame < row.to + 2;
  const tint = interpolate(frame, [row.at, row.at + 8], [0, 1], { ...CLAMP, easing: EASE });
  const strike = isDel ? interpolate(frame, [row.at + 4, row.at + 13], [0, 1], { ...CLAMP, easing: EASE }) : 0;
  // the blueprint's diff sweep: a band of light passes once the line is written
  const sweep = isAdd ? interpolate(frame, [row.to, row.to + 16], [-40, 140], CLAMP) : -40;

  return (
    <div
      style={{
        position: "relative",
        height: ROW_H,
        display: "grid",
        gridTemplateColumns: "70px 40px 1fr",
        alignItems: "center",
        fontFamily: FONT.mono,
        fontSize: 26,
        whiteSpace: "pre",
        opacity: show,
        translate: `${(1 - show) * -14}px 0`,
      }}
    >
      {isAdd || isDel ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: isAdd ? "rgba(105,194,126,0.13)" : "rgba(222,131,84,0.13)",
            scale: `${tint} 1`,
            transformOrigin: "0 50%",
          }}
        />
      ) : null}
      {isAdd ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${sweep}%`,
            width: "40%",
            background: `linear-gradient(90deg, transparent, ${C.glow}, transparent)`,
            opacity: 0.8,
          }}
        />
      ) : null}
      <span style={{ position: "relative", textAlign: "right", paddingRight: 14, color: C.faint }}>{row.n}</span>
      <span style={{ position: "relative", color: isAdd ? C.leaf : isDel ? C.rust : "transparent", textAlign: "center" }}>
        {isAdd ? "+" : isDel ? "−" : " "}
      </span>
      <span style={{ position: "relative", paddingRight: 22, color: isDel ? "rgba(245,244,239,0.6)" : C.fg }}>
        <span style={{ position: "relative" }}>
          {row.code.slice(0, typed)}
          {isDel ? (
            <span
              style={{
                position: "absolute",
                left: "1.1em",
                right: 0,
                top: "52%",
                height: 3,
                background: C.rust,
                scale: `${strike} 1`,
                transformOrigin: "0 50%",
              }}
            />
          ) : null}
        </span>
        {typing ? <i style={{ display: "inline-block", width: 3, height: 30, background: C.leaf, verticalAlign: "-6px", marginLeft: 2 }} /> : null}
      </span>
    </div>
  );
};

/** 0:09 — "Then it writes the fix.": the diff, typed by the agent, line by line. */
export const Fix: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 18], [0, 1], { ...CLAMP, easing: EASE });
  const ready = interpolate(frame, [READY, READY + 8], [0, 1], { ...CLAMP, easing: EASE });

  return (
    <AbsoluteFill style={{ fontFamily: FONT.body, scale: `${interpolate(frame, [0, DUR.fix], [1, 1.03])}` }}>
      <Headline segs={[{ text: "Then it writes", br: true }, { text: "the fix.", tone: "leaf", italic: true }]} at={0} top={250} />

      <div
        style={{
          ...card,
          left: 90,
          top: 560,
          width: 860,
          opacity: enter,
          transform: `perspective(2400px) translateY(${(1 - enter) * 90}px) rotateX(${(1 - enter) * 18}deg)`,
          transformOrigin: "50% 0%",
        }}
      >
        {/* file tabs */}
        <div style={{ height: 84, display: "flex", alignItems: "stretch", gap: 8, padding: "0 22px", borderBottom: `2px solid ${C.line}` }}>
          <div style={{ display: "flex", alignItems: "center", padding: "0 14px", fontFamily: FONT.mono, fontSize: 26, color: C.fg, borderBottom: `4px solid ${C.leaf}` }}>
            app/layout.tsx
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 14px", fontFamily: FONT.mono, fontSize: 26, color: C.faint }}>
            olmene-jsonld.tsx
            <Pill tone="leaf" size={18}>
              new
            </Pill>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, fontFamily: FONT.mono, fontSize: 26 }}>
            <span style={{ color: C.leaf }}>+3</span>
            <span style={{ color: C.rust }}>−1</span>
          </div>
        </div>

        <div style={{ padding: "14px 0" }}>
          {ROWS.map((row, i) => (
            <DiffRow key={i} row={row} />
          ))}
        </div>

        {/* agent status */}
        <div style={{ height: 96, display: "flex", alignItems: "center", gap: 18, padding: "0 30px", borderTop: `2px solid ${C.line}`, background: "rgba(42,43,40,0.5)" }}>
          <div style={{ position: "relative", width: 44, height: 44 }}>
            <Flower size={44} breathe={1 - ready} style={{ position: "absolute", inset: 0 }} />
          </div>
          <div style={{ position: "relative", flex: 1, height: 40 }}>
            <span style={{ position: "absolute", left: 0, top: 0, fontSize: 31, color: C.muted, opacity: 1 - ready }}>Writing the fix…</span>
            <span
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 31,
                fontWeight: 500,
                color: C.fg,
                opacity: ready,
                translate: `0 ${(1 - ready) * 12}px`,
              }}
            >
              3 changes ready for review
              <CheckIcon size={34} draw={ready} />
            </span>
          </div>
          <Pill tone="amber" caps size={19}>
            Example
          </Pill>
        </div>
      </div>

      <Headline
        segs={[{ text: "Each change comes with its evidence.", italic: true }]}
        at={b(5)}
        stagger={2}
        size={54}
        top={1214}
        style={{ color: C.muted }}
      />

      <Sfx name="whoosh" at={6} volume={0.3} />
      <Sfx name="tick" at={b(1)} volume={0.45} />
      <Sfx name="tick" at={b(1.5)} volume={0.55} />
      <Sfx name="tick" at={b(2)} volume={0.55} />
      <Sfx name="tick" at={b(3.5)} volume={0.55} />
      <Sfx name="ding1" at={READY} volume={0.55} />
    </AbsoluteFill>
  );
};
