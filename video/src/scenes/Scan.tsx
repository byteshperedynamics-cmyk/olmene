import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Headline } from "../components/Headline";
import { ArrowIcon, CheckIcon } from "../components/Icons";
import { Sfx, type SfxName } from "../components/Sfx";
import { Dots, SiteWireframe, UrlText } from "../components/Site";
import { card, Pill, Pin, PulseDot } from "../components/ui";
import "../fonts";
import { C, CLAMP, EASE, FONT, POP } from "../theme";
import { DUR, sceneBeats } from "../timeline";

const URL = "acme-analytics.com";
const b = sceneBeats("scan");
const TYPE_FROM = b(1);
const TYPE_TO = b(3);
const PRESS = b(3.5);
const MORPH = b(4); // bar 2: the input becomes the browser chrome
const SCAN_FROM = b(6);
const SCAN_TO = b(9);

const CARD = { left: 90, top: 560, inputTop: 760, width: 860 };
const BODY_H = 660;

/** Where each finding sits in the page, and the beam progress that reveals it. */
const PINS = [
  { label: "Generic page title", y: 0.4, left: "5%" },
  { label: "No meta description", y: 0.56, right: "4%" },
  { label: "Unreadable to AI search", y: 0.72, left: "9%" },
] as const;

const beamAt = (p: number) => Math.round(SCAN_FROM + (SCAN_TO - SCAN_FROM) * p);

/**
 * 0:03 — the drop. "Paste your URL.": the URL is typed, the input unfolds into
 * the browser, the scan beam (the hero's signature motion) reads the page and
 * the three findings from the hook surface where they live.
 */
export const Scan: React.FC = () => {
  const frame = useCurrentFrame();

  const enter = interpolate(frame, [6, 20], [0, 1], { ...CLAMP, easing: EASE });
  const typed = Math.floor(interpolate(frame, [TYPE_FROM, TYPE_TO], [0, URL.length], CLAMP));
  const press = interpolate(frame, [PRESS, PRESS + 3, PRESS + 9], [0, 1, 0], CLAMP);
  const morph = interpolate(frame, [MORPH, MORPH + 22], [0, 1], { ...CLAMP, easing: EASE });
  const unfold = interpolate(frame, [MORPH + 2, MORPH + 30], [0, 1], { ...CLAMP, easing: EASE });
  // While it is an input it sits mid-frame; it rises into place as it unfolds.
  const cardTop = interpolate(frame, [MORPH - 4, MORPH + 22], [CARD.inputTop, CARD.top], { ...CLAMP, easing: EASE });
  const chromeH = interpolate(morph, [0, 1], [140, 92]);
  const bodyH = unfold * BODY_H;
  const scanP = interpolate(frame, [SCAN_FROM, SCAN_TO], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.quad) });
  const scanning = frame >= SCAN_FROM && frame < SCAN_TO + 4;
  const done = frame >= SCAN_TO + 2;
  const checks = Math.round(scanP * 21);
  const chip = interpolate(frame, [SCAN_TO + 2, SCAN_TO + 14], [0, 1], { ...CLAMP, easing: POP });
  const caretOn = frame < TYPE_TO + 2 || Math.floor(frame / 8) % 2 === 0;

  const keys: SfxName[] = ["key1", "key2", "key3"];

  return (
    <AbsoluteFill style={{ fontFamily: FONT.body, scale: `${interpolate(frame, [MORPH, DUR.scan], [1, 1.025], CLAMP)}` }}>
      <Headline segs={[{ text: "Paste your URL." }]} at={2} exitAt={PRESS} top={560} />
      <Headline segs={[{ text: "Olmene finds" }, { text: "why.", tone: "leaf", italic: true }]} at={MORPH + 6} top={290} />

      {/* the input that becomes the browser */}
      <div
        style={{
          ...card,
          left: CARD.left,
          top: cardTop,
          width: CARD.width,
          height: chromeH + bodyH,
          borderRadius: interpolate(morph, [0, 1], [36, 30]),
          opacity: enter,
          translate: `0 ${(1 - enter) * 50}px`,
          scale: `${0.96 + 0.04 * enter}`,
          boxShadow: `0 50px 120px -40px rgba(0,0,0,0.75), 0 0 0 10px ${morph < 0.5 ? "rgba(105,194,126,0.16)" : "rgba(34,35,32,0.45)"}`,
          transform: `perspective(2400px) rotateX(${interpolate(unfold, [0, 1], [10, 0])}deg)`,
          transformOrigin: "50% 0%",
        }}
      >
        {/* chrome / input row */}
        <div
          style={{
            position: "relative",
            height: chromeH,
            borderBottom: `2px solid ${unfold > 0.02 ? C.line : "transparent"}`,
            background: unfold > 0.02 ? "rgba(42,43,40,0.6)" : "transparent",
          }}
        >
          <Dots style={{ position: "absolute", left: 32, top: chromeH / 2 - 9, opacity: interpolate(frame, [MORPH + 6, MORPH + 16], [0, 1], CLAMP) }} />
          {/* url bar pill that forms around the text */}
          <div
            style={{
              position: "absolute",
              left: 122,
              right: 220,
              top: chromeH / 2 - 28,
              height: 56,
              borderRadius: 14,
              background: C.bg,
              border: `2px solid ${C.line}`,
              opacity: interpolate(frame, [MORPH + 8, MORPH + 18], [0, 1], CLAMP),
            }}
          />
          <div
            style={{
              position: "absolute",
              left: interpolate(morph, [0, 1], [44, 146]),
              top: 0,
              height: chromeH,
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <i style={{ width: 12, height: 12, borderRadius: 6, background: C.leaf, opacity: morph * 0.8, marginRight: interpolate(morph, [0, 1], [-26, 0]) }} />
            {typed === 0 && frame < TYPE_FROM ? (
              <span style={{ fontFamily: FONT.mono, fontSize: 46, color: C.faint }}>yoursite.com</span>
            ) : (
              <UrlText text={URL.slice(0, typed)} size={interpolate(morph, [0, 1], [46, 30])} caret={morph < 0.5 && caretOn} />
            )}
          </div>
          {/* Scan button */}
          <div
            style={{
              position: "absolute",
              right: 22,
              top: 22,
              height: 96,
              padding: "0 34px",
              borderRadius: 22,
              background: C.leaf,
              color: C.leafInk,
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontWeight: 600,
              fontSize: 40,
              opacity: interpolate(frame, [MORPH - 2, MORPH + 6], [1, 0], CLAMP),
              scale: `${1 - press * 0.07}`,
              filter: `brightness(${1 + press * 0.25})`,
              boxShadow: `0 10px 30px -8px ${C.glow}`,
            }}
          >
            Scan <ArrowIcon size={36} stroke={2.8} />
          </div>
          <Pill
            tone="amber"
            caps
            size={20}
            style={{ position: "absolute", right: 30, top: chromeH / 2 - 19, opacity: interpolate(frame, [MORPH + 12, MORPH + 22], [0, 1], CLAMP) }}
          >
            Preview
          </Pill>
        </div>

        {/* the page */}
        <div style={{ position: "relative", height: bodyH, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: BODY_H }}>
            <SiteWireframe />

            {/* scan beam */}
            {frame >= SCAN_FROM - 2 && frame <= SCAN_TO + 8 ? (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: scanP * BODY_H,
                  height: 150,
                  translate: "0 -100%",
                  opacity: interpolate(frame, [SCAN_FROM - 2, SCAN_FROM + 2, SCAN_TO, SCAN_TO + 8], [0, 1, 1, 0], CLAMP),
                  background: `linear-gradient(to bottom, transparent, ${C.leafSoft} 75%, rgba(105,194,126,0.26))`,
                  borderBottom: `3px solid ${C.leaf}`,
                  boxShadow: `0 12px 36px -6px ${C.glow}`,
                }}
              />
            ) : null}

            {/* readiness chip, after the scan */}
            <div
              style={{
                position: "absolute",
                right: 34,
                top: 112,
                padding: "14px 22px 12px",
                borderRadius: 18,
                background: "rgba(26,27,25,0.92)",
                border: `2px solid ${C.lineStrong}`,
                boxShadow: "0 16px 40px -12px rgba(0,0,0,0.6)",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                opacity: interpolate(frame, [SCAN_TO + 2, SCAN_TO + 6], [0, 1], CLAMP),
                scale: `${0.6 + 0.4 * chip}`,
              }}
            >
              <span style={{ fontFamily: FONT.display, fontSize: 76, lineHeight: 0.95, color: C.rust, fontVariantNumeric: "tabular-nums" }}>61</span>
              <span style={{ fontFamily: FONT.mono, fontSize: 18, letterSpacing: "0.12em", color: C.faint }}>READINESS</span>
            </div>

            {PINS.map((pin) => (
              <Pin
                key={pin.label}
                label={pin.label}
                at={beamAt(pin.y + 0.05)}
                size={30}
                style={{
                  top: pin.y * BODY_H - 26,
                  ...("left" in pin ? { left: pin.left } : { right: pin.right }),
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* the hero's trust line, under the input while it is still an input */}
      <div
        style={{
          position: "absolute",
          top: cardTop + 140 + 48,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 34,
          fontFamily: FONT.mono,
          fontSize: 30,
          color: C.faint,
          opacity: interpolate(frame, [14, 24, MORPH - 6, MORPH + 2], [0, 1, 1, 0], CLAMP),
        }}
      >
        {["Free · 30 seconds", "No card"].map((t) => (
          <span key={t} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <i style={{ width: 9, height: 9, borderRadius: 5, background: "rgba(105,194,126,0.7)" }} />
            {t}
          </span>
        ))}
      </div>

      {/* live readout under the browser */}
      <div
        style={{
          position: "absolute",
          top: CARD.top + 92 + BODY_H + 34,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 16,
          fontFamily: FONT.mono,
          fontSize: 32,
          color: done ? C.fg : C.muted,
          opacity: interpolate(frame, [SCAN_FROM - 4, SCAN_FROM + 4], [0, 1], CLAMP),
        }}
      >
        {done ? <CheckIcon size={36} /> : <PulseDot color={C.leaf} size={16} period={24} />}
        {done ? "21 checks · 3 findings" : scanning ? `Scanning · ${checks}/21 checks` : "Reading your live HTML"}
      </div>

      {Array.from({ length: URL.length }, (_, i) => (
        <Sfx key={i} name={keys[i % 3]} at={TYPE_FROM + Math.round((i * (TYPE_TO - TYPE_FROM)) / URL.length)} volume={0.32} />
      ))}
      <Sfx name="click" at={PRESS} volume={0.8} />
      <Sfx name="whoosh" at={MORPH} volume={0.35} />
      <Sfx name="sweep" at={SCAN_FROM} volume={0.6} />
      {PINS.map((pin) => (
        <Sfx key={pin.label} name="alert" at={beamAt(pin.y + 0.05)} volume={0.45} />
      ))}
      <Sfx name="pop" at={SCAN_TO + 2} volume={0.7} />
    </AbsoluteFill>
  );
};
