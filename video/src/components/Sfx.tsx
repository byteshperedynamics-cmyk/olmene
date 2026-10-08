import { Audio } from "@remotion/media";
import { staticFile, useVideoConfig } from "remotion";

export type SfxName =
  | "impact"
  | "pop"
  | "alert"
  | "key1"
  | "key2"
  | "key3"
  | "click"
  | "whoosh"
  | "sweep"
  | "tick"
  | "chime"
  | "ding1"
  | "ding2"
  | "ding3"
  | "riser"
  | "bloom";

/** One sound effect from public/audio/sfx/ (made by scripts/make-audio.mjs), placed at a local frame. */
export const Sfx: React.FC<{ name: SfxName; at: number; volume?: number }> = ({ name, at, volume = 1 }) => {
  const { fps } = useVideoConfig();
  return <Audio name={`sfx: ${name}`} src={staticFile(`audio/sfx/${name}.wav`)} from={at} volume={volume} premountFor={fps} />;
};
