import { OVERLAP } from "./theme";

/**
 * The edit, in frames at 30 fps. The soundtrack runs at 120 BPM, so one beat
 * is exactly 15 frames: every visual cut below lands on a beat and every scene
 * boundary after the drop lands on a bar line (scripts/make-audio.mjs uses the
 * same numbers).
 */
export const FPS = 30;
export const BEAT = 15;

/** Global frame of each cut — the middle of the transition into that scene. */
export const CUTS = {
  scan: 90, // the drop
  fix: 270,
  review: 390,
  prove: 510,
  end: 630,
} as const;

export const TOTAL = 780; // 26 s

/** Sequence lengths: neighbours overlap by OVERLAP frames, centred on the cut. */
export const DUR = {
  hook: CUTS.scan + OVERLAP / 2,
  scan: CUTS.fix - CUTS.scan + OVERLAP,
  fix: CUTS.review - CUTS.fix + OVERLAP,
  review: CUTS.prove - CUTS.review + OVERLAP,
  prove: CUTS.end - CUTS.prove + OVERLAP,
  end: TOTAL - CUTS.end + OVERLAP / 2,
} as const;
