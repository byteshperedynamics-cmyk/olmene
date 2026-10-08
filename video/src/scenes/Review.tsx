import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Flower } from "../components/Flower";
import { Headline } from "../components/Headline";
import { CheckIcon, Cursor } from "../components/Icons";
import { Sfx } from "../components/Sfx";
import { card, Pill, PulseDot } from "../components/ui";
import "../fonts";
import { C, CLAMP, EASE, FONT, POP } from "../theme";

const CARD = { left: 90, top: 560, width: 860 };
const HEAD_H = 124;
const ROW_H = 132;
const FOOT_TOP = CARD.top + HEAD_H + ROW_H * 2;
const BTN = { top: 88, h: 80, approveW: 340, declineW: 230 };
// Approve button centre in frame coordinates (card border 2px + footer padding 30px).
const APPROVE = { x: CARD.left + CARD.width - 32 - BTN.approveW / 2, y: FOOT_TOP + BTN.top + BTN.h / 2 };

const CLICK = 62;

const CHANGES = [
  { label: "Descriptive title and meta description", impact: "high impact", tone: "rust" as const, at: 30 },
  { label: "Organization JSON-LD for AI search", impact: "medium", tone: "neutral" as const, at: 38 },
];

/** 0:13 — "You stay in control.": the review screen, the user approves, the PR opens. */
export const Review: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [0, 18], [0, 1], { ...CLAMP, easing: EASE });
  // The old state clears first, then the new one arrives — never on top of each other.
  const out = interpolate(frame, [CLICK + 2, CLICK + 6], [0, 1], { ...CLAMP, easing: EASE });
  const approved = interpolate(frame, [CLICK + 6, CLICK + 14], [0, 1], { ...CLAMP, easing: EASE });
  const toast = interpolate(frame, [CLICK + 6, CLICK + 18], [0, 1], { ...CLAMP, easing: POP });

  // Cursor glides in on a slight curve (x and y ease differently), then clicks.
  const move = (from: number, to: number, ease: (t: number) => number) =>
    interpolate(frame, [26, CLICK - 4], [from, to], { ...CLAMP, easing: ease });
  const cx = move(1010, APPROVE.x - 6, Easing.bezier(0.45, 0, 0.2, 1));
  const cy = move(1560, APPROVE.y - 8, Easing.bezier(0.3, 0, 0.1, 1));
  const press = interpolate(frame, [CLICK, CLICK + 3, CLICK + 8], [0, 1, 0], CLAMP);
  const hover = interpolate(frame, [CLICK - 8, CLICK - 2], [0, 1], CLAMP);
  const ripple = interpolate(frame, [CLICK, CLICK + 18], [0, 1], { ...CLAMP, easing: EASE });

  return (
    <AbsoluteFill style={{ fontFamily: FONT.body, scale: `${interpolate(frame, [0, 134], [1, 1.03])}` }}>
      <Headline segs={[{ text: "You stay", br: true }, { text: "in control.", tone: "leaf", italic: true }]} at={0} top={250} />

      <div
        style={{
          ...card,
          left: CARD.left,
          top: CARD.top,
          width: CARD.width,
          height: HEAD_H + ROW_H * 2 + 196,
          opacity: enter,
          transform: `perspective(2400px) translateY(${(1 - enter) * 90}px) rotateX(${(1 - enter) * 18}deg)`,
          transformOrigin: "50% 0%",
        }}
      >
        {/* agent header */}
        <div style={{ height: HEAD_H, display: "flex", alignItems: "center", gap: 22, padding: "0 30px", borderBottom: `2px solid ${C.line}` }}>
          <Flower size={58} breathe={1 - approved} />
          <div style={{ position: "relative", flex: 1, height: 80 }}>
            <div style={{ position: "absolute", top: 2, fontSize: 34, fontWeight: 600, color: C.fg, opacity: 1 - out, translate: `0 ${out * -14}px` }}>
              Waiting for your review
            </div>
            <div
              style={{
                position: "absolute",
                top: 2,
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 34,
                fontWeight: 600,
                color: C.leaf,
                opacity: approved,
                translate: `0 ${(1 - approved) * 14}px`,
              }}
            >
              Approved by you <CheckIcon size={34} draw={approved} />
            </div>
            <div style={{ position: "absolute", top: 48, fontFamily: FONT.mono, fontSize: 24, color: C.muted }}>acme/site · main</div>
          </div>
        </div>

        {CHANGES.map((c) => {
          const tick = interpolate(frame, [c.at, c.at + 8], [0, 1], { ...CLAMP, easing: EASE });
          return (
            <div
              key={c.label}
              style={{ height: ROW_H, display: "flex", alignItems: "center", gap: 22, padding: "0 30px", borderBottom: `2px solid ${C.line}` }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  flex: "none",
                  borderRadius: 11,
                  border: `2px solid ${tick > 0.1 ? C.leaf : C.lineStrong}`,
                  background: tick > 0.1 ? C.leaf : "transparent",
                  display: "grid",
                  placeItems: "center",
                  scale: `${1 + Math.sin(tick * Math.PI) * 0.15}`,
                }}
              >
                <CheckIcon size={30} color={C.leafInk} draw={tick} stroke={3.6} />
              </div>
              <div style={{ flex: 1, fontSize: 32, lineHeight: 1.25, color: C.fg }}>{c.label}</div>
              <Pill tone={c.tone} size={21}>
                {c.impact}
              </Pill>
            </div>
          );
        })}

        {/* footer: note + decision, then the PR toast */}
        <div style={{ position: "relative", height: 196, background: "rgba(42,43,40,0.5)" }}>
          <div style={{ position: "absolute", left: 30, top: 30, fontSize: 27, color: C.muted, opacity: 1 - out }}>
            Opens a pull request on <span style={{ fontFamily: FONT.mono, fontSize: 25, color: C.fg }}>olmene/fix-7f3a</span>
          </div>
          <div
            style={{
              position: "absolute",
              left: 30,
              top: 30,
              fontSize: 27,
              color: C.muted,
              opacity: approved,
            }}
          >
            On its own branch. Merge it when you are ready.
          </div>
          <div
            style={{
              position: "absolute",
              right: 30,
              top: BTN.top,
              display: "flex",
              gap: 16,
              opacity: 1 - out,
              scale: `${1 - out * 0.05}`,
            }}
          >
            <div
              style={{
                width: BTN.declineW,
                height: BTN.h,
                borderRadius: 18,
                border: `2px solid ${C.lineStrong}`,
                display: "grid",
                placeItems: "center",
                fontSize: 31,
                color: C.fg,
              }}
            >
              Decline all
            </div>
            <div
              style={{
                position: "relative",
                width: BTN.approveW,
                height: BTN.h,
                borderRadius: 18,
                background: C.leaf,
                color: C.leafInk,
                display: "grid",
                placeItems: "center",
                fontSize: 31,
                fontWeight: 600,
                overflow: "hidden",
                scale: `${1 - press * 0.06}`,
                filter: `brightness(${1 + hover * 0.12 + press * 0.15})`,
                boxShadow: `0 12px 34px -10px ${C.glow}`,
              }}
            >
              {/* the site's o-sheen */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)",
                  translate: `${interpolate(frame, [34, 58], [-120, 120], CLAMP)}% 0`,
                }}
              />
              <span style={{ position: "relative" }}>Approve 2 changes</span>
            </div>
          </div>

          {/* PR opened toast */}
          <div
            style={{
              position: "absolute",
              left: 30,
              right: 30,
              top: BTN.top,
              height: BTN.h,
              borderRadius: 18,
              background: C.leaf,
              color: C.leafInk,
              display: "flex",
              alignItems: "center",
              gap: 18,
              padding: "0 28px",
              boxShadow: `0 14px 40px -10px ${C.glow}`,
              opacity: interpolate(frame, [CLICK + 6, CLICK + 10], [0, 1], CLAMP),
              scale: `${0.9 + 0.1 * toast}`,
              translate: `0 ${(1 - toast) * 16}px`,
            }}
          >
            <PulseDot color={C.leafInk} size={16} />
            <span style={{ fontSize: 32, fontWeight: 600 }}>PR #14 opened · 3 fixes</span>
            <span style={{ marginLeft: "auto", fontFamily: FONT.mono, fontSize: 25, opacity: 0.8 }}>view diff →</span>
          </div>
        </div>
      </div>

      {/* click ripple */}
      <div
        style={{
          position: "absolute",
          left: APPROVE.x - 80,
          top: APPROVE.y - 80,
          width: 160,
          height: 160,
          borderRadius: "50%",
          border: `4px solid ${C.leaf}`,
          scale: `${0.2 + ripple}`,
          opacity: frame >= CLICK ? (1 - ripple) * 0.8 : 0,
        }}
      />
      <Cursor x={cx} y={cy} press={press} opacity={interpolate(frame, [26, 32, CLICK + 30, CLICK + 40], [0, 1, 1, 0], CLAMP)} />

      <Headline
        segs={[{ text: "Nothing merges without you.", italic: true }]}
        at={CLICK + 20}
        stagger={2}
        size={66}
        top={1198}
        style={{ color: C.fg }}
      />

      <Sfx name="whoosh" at={6} volume={0.3} />
      <Sfx name="tick" at={CHANGES[0].at} volume={0.5} />
      <Sfx name="tick" at={CHANGES[1].at} volume={0.5} />
      <Sfx name="click" at={CLICK} volume={0.9} />
      <Sfx name="chime" at={CLICK + 6} volume={0.7} />
    </AbsoluteFill>
  );
};
