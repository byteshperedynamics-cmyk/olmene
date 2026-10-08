import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C } from "../theme";
import {
  CUTS,
  DOWNBEAT_FRAMES,
  FINAL_FRAME,
  GAP_FRAME,
  KICK_FRAMES,
} from "../timeline";

const DROP = CUTS.scan;
const HARD_HITS = [
  DROP,
  CUTS.fix,
  CUTS.review,
  CUTS.prove,
  CUTS.end,
  FINAL_FRAME,
];

/** Decaying envelope of the most recent hit at or before `frame`. */
const hit = (frame: number, hits: number[], decay: number) => {
  let last = -Infinity;
  for (const h of hits) if (h <= frame && h > last) last = h;
  return last === -Infinity ? 0 : Math.exp(-(frame - last) / decay);
};

/**
 * The phonk-edit layer, locked to the soundtrack: a small zoom punch on every
 * 808, and on the drop and each cut a harder punch with shake, an RGB split
 * and a flash. In the half beat of silence before the drop the frame pushes in.
 */
export const BeatFx: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const frame = useCurrentFrame();

  const kick =
    hit(frame, KICK_FRAMES, 3.5) * 0.012 +
    hit(frame, DOWNBEAT_FRAMES, 3.5) * 0.01;
  const hard = hit(frame, HARD_HITS, 4.5);
  // tension in the gap: push in, then the drop snaps back with a punch
  const gap =
    frame >= GAP_FRAME && frame < DROP
      ? interpolate(frame, [GAP_FRAME, DROP], [0, 1])
      : 0;

  const scale = 1 + kick + hard * 0.05 + gap * 0.07;
  const shake = hard * 14;
  const split = hard * 9;

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          scale: `${scale}`,
          translate: `${Math.sin(frame * 2.7) * shake}px ${Math.cos(frame * 3.3) * shake * 0.6}px`,
          filter:
            split > 0.4
              ? `drop-shadow(${split}px 0 0 rgba(255,46,99,0.55)) drop-shadow(${-split}px 0 0 rgba(46,230,255,0.5))`
              : gap > 0
                ? `saturate(${1 - gap * 0.6}) brightness(${1 - gap * 0.25})`
                : undefined,
        }}
      >
        {children}
      </AbsoluteFill>
      {/* the flash: strongest on the drop */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background: `radial-gradient(120% 90% at 50% 45%, rgba(220,255,226,0.95), ${C.leaf})`,
          mixBlendMode: "screen",
          opacity:
            hit(frame, [DROP], 2.2) * 0.55 +
            hit(frame, HARD_HITS.slice(1), 2) * 0.16,
        }}
      />
    </AbsoluteFill>
  );
};
