import { AbsoluteFill, Composition, Folder, Still } from "remotion";
import { Background } from "./components/Background";
import { Cover } from "./Cover";
import { OlmeneTikTok } from "./OlmeneTikTok";
import { EndCard } from "./scenes/EndCard";
import { Fix } from "./scenes/Fix";
import { Hook } from "./scenes/Hook";
import { Prove } from "./scenes/Prove";
import { Review } from "./scenes/Review";
import { Scan } from "./scenes/Scan";
import { DUR, TOTAL } from "./timeline";

/** Scenes have transparent backgrounds (the main video draws one shared ground). */
const withGround = (Scene: React.FC) => {
  const Previewed: React.FC = () => (
    <AbsoluteFill>
      <Background />
      <Scene />
    </AbsoluteFill>
  );
  return Previewed;
};

const HookScene = withGround(Hook);
const ScanScene = withGround(Scan);
const FixScene = withGround(Fix);
const ReviewScene = withGround(Review);
const ProveScene = withGround(Prove);
const EndScene = withGround(EndCard);

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="OlmeneTikTok"
      component={OlmeneTikTok}
      durationInFrames={TOTAL}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ music: true }}
    />
    <Still id="Cover" component={Cover} width={1080} height={1920} />
    <Folder name="Scenes">
      <Composition id="Hook" component={HookScene} durationInFrames={DUR.hook} fps={30} width={1080} height={1920} />
      <Composition id="Scan" component={ScanScene} durationInFrames={DUR.scan} fps={30} width={1080} height={1920} />
      <Composition id="Fix" component={FixScene} durationInFrames={DUR.fix} fps={30} width={1080} height={1920} />
      <Composition id="Review" component={ReviewScene} durationInFrames={DUR.review} fps={30} width={1080} height={1920} />
      <Composition id="Prove" component={ProveScene} durationInFrames={DUR.prove} fps={30} width={1080} height={1920} />
      <Composition id="End" component={EndScene} durationInFrames={DUR.end} fps={30} width={1080} height={1920} />
    </Folder>
  </>
);
