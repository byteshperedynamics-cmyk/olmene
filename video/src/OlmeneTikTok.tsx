import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill, Easing, staticFile, useVideoConfig } from "remotion";
import { Background } from "./components/Background";
import { Sfx } from "./components/Sfx";
import "./fonts";
import { EndCard } from "./scenes/EndCard";
import { Fix } from "./scenes/Fix";
import { Hook } from "./scenes/Hook";
import { Prove } from "./scenes/Prove";
import { Review } from "./scenes/Review";
import { Scan } from "./scenes/Scan";
import { C, EASE, OVERLAP } from "./theme";
import { CUTS, DUR } from "./timeline";
import { scanWipe, zoomFade } from "./transitions";

export type OlmeneTikTokProps = {
  /** false = sound effects only, for posting with a sound picked in TikTok. */
  readonly music: boolean;
};

/**
 * Olmene — 26 s vertical promo for TikTok (1080×1920, 30 fps).
 * Problem → scan → fix → you approve → verified → olmene.com, one scene per
 * beat-aligned section of the soundtrack (see timeline.ts).
 */
export const OlmeneTikTok: React.FC<OlmeneTikTokProps> = ({ music }) => {
  const { fps } = useVideoConfig();
  // Wipes cross the middle of the frame exactly on the cut.
  const wipe = linearTiming({ durationInFrames: OVERLAP, easing: Easing.inOut(Easing.cubic) });
  const push = linearTiming({ durationInFrames: OVERLAP, easing: EASE });

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <Background />

      <TransitionSeries>
        <TransitionSeries.Sequence name="Hook" durationInFrames={DUR.hook} premountFor={fps}>
          <Hook />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={scanWipe()} timing={wipe} />
        <TransitionSeries.Sequence name="Scan" durationInFrames={DUR.scan} premountFor={fps}>
          <Scan />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={push} />
        <TransitionSeries.Sequence name="Fix" durationInFrames={DUR.fix} premountFor={fps}>
          <Fix />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={scanWipe()} timing={wipe} />
        <TransitionSeries.Sequence name="Review" durationInFrames={DUR.review} premountFor={fps}>
          <Review />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={push} />
        <TransitionSeries.Sequence name="Prove" durationInFrames={DUR.prove} premountFor={fps}>
          <Prove />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={zoomFade()} timing={wipe} />
        <TransitionSeries.Sequence name="End" durationInFrames={DUR.end} premountFor={fps}>
          <EndCard />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      <Audio name="Music" src={staticFile("audio/music.wav")} muted={!music} volume={0.9} />
      <Sfx name="sweep" at={CUTS.scan - OVERLAP / 2} volume={0.45} />
      <Sfx name="whoosh" at={CUTS.fix - OVERLAP / 2} volume={0.4} />
      <Sfx name="sweep" at={CUTS.review - OVERLAP / 2} volume={0.45} />
      <Sfx name="whoosh" at={CUTS.prove - OVERLAP / 2} volume={0.4} />
      <Sfx name="whoosh" at={CUTS.end - OVERLAP / 2} volume={0.35} />
    </AbsoluteFill>
  );
};
