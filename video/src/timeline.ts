import MAP from "./beat-map.json";
import { CUT, OVERLAP } from "./theme";

/**
 * The edit is built on a beat grid. beat-map.json holds the tempo and where
 * each scene starts (in beats); scripts/make-audio.mjs reads the same file, so
 * the soundtrack and the cuts can never drift apart. To re-time the video to
 * another sound, change `bpm` and re-render.
 */
export const FPS = MAP.fps;
export const BPM = MAP.bpm;
export const FRAMES_PER_BEAT = (FPS * 60) / BPM;

/** Global frame of beat n (rounded per beat, so errors never accumulate). */
export const beat = (n: number) => Math.round(n * FRAMES_PER_BEAT);

export type Section = Exclude<keyof typeof MAP.sections, "total">;
export const SECTION_BEATS = MAP.sections;

/** Global frame of each cut — the middle of the transition into that scene. */
export const CUTS = {
  scan: beat(MAP.sections.scan), // the drop
  fix: beat(MAP.sections.fix),
  review: beat(MAP.sections.review),
  prove: beat(MAP.sections.prove),
  end: beat(MAP.sections.end),
} as const;

export const TOTAL = beat(MAP.sections.total);

/** Sequence lengths: neighbours overlap by OVERLAP frames, centred on the cut. */
export const DUR = {
  hook: CUTS.scan + OVERLAP / 2,
  scan: CUTS.fix - CUTS.scan + OVERLAP,
  fix: CUTS.review - CUTS.fix + OVERLAP,
  review: CUTS.prove - CUTS.review + OVERLAP,
  prove: CUTS.end - CUTS.prove + OVERLAP,
  end: TOTAL - CUTS.end + OVERLAP / 2,
} as const;

/**
 * Beat clock inside a scene: b(n) is the scene's local frame of the n-th beat
 * after its cut (b(0) = CUT). The hook starts at frame 0, so its b(0) = 0.
 */
export const sceneBeats = (section: Section) => {
  const at = MAP.sections[section];
  const offset = section === "hook" ? 0 : CUT;
  return (n: number) => beat(at + n) - beat(at) + offset;
};

/**
 * Every 808 hit of the soundtrack's groove (same pattern and gaps as
 * scripts/make-audio.mjs) — the edit punches on these.
 */
const grooveSteps = (() => {
  const steps: number[] = [];
  const cuts = [
    MAP.sections.fix,
    MAP.sections.review,
    MAP.sections.prove,
    MAP.sections.end,
  ];
  for (let step = MAP.sections.scan * 4; step < MAP.finalHit * 4; step++) {
    const b = step / 4;
    if (cuts.some((c) => b >= c - 0.5 && b < c)) continue;
    if (MAP.kickSteps.includes(step % 16)) steps.push(step);
  }
  return steps;
})();
export const KICK_FRAMES = grooveSteps.map((step) => beat(step / 4));
/** The 808s that fall on a bar line hit a little harder. */
export const DOWNBEAT_FRAMES = grooveSteps
  .filter((step) => step % 16 === 0)
  .map((step) => beat(step / 4));

/** The slam in the hook (beat 1) and the last hit before the tape stop. */
export const SLAM_FRAME = beat(1);
export const FINAL_FRAME = beat(MAP.finalHit);
/** The half-beat of silence before the drop. */
export const GAP_FRAME = beat(MAP.sections.scan - 0.5);
