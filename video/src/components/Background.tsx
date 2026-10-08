import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "../theme";
import { CUTS } from "../timeline";

/**
 * The "living instrument" ground: warm dark surface, a faint measurement grid
 * drifting upwards, a slow leaf-green light and a vignette. Rendered once
 * under every scene so the grid never jumps at a cut.
 */
export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  // The light wanders slowly around the upper-middle of the frame.
  const glowX = 540 + Math.sin(t * 0.45) * 160;
  const glowY = 760 + Math.cos(t * 0.33) * 140;
  // Green means proof: no leaf light while the problem is on screen; it comes
  // up with the agent at the drop and warms for the end card.
  const glowStrength = interpolate(
    frame,
    [CUTS.scan - 8, CUTS.scan + 8, CUTS.end - 10, CUTS.end + 20],
    [0, 0.55, 0.55, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, overflow: "hidden" }}>
      {/* minor grid */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(rgba(245,244,239,0.045) 2px, transparent 2px), linear-gradient(90deg, rgba(245,244,239,0.045) 2px, transparent 2px)`,
          backgroundSize: "60px 60px",
          backgroundPosition: `-1px ${-(frame * 0.6) % 60}px`,
        }}
      />
      {/* major grid every fourth line */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(rgba(245,244,239,0.06) 2px, transparent 2px), linear-gradient(90deg, rgba(245,244,239,0.06) 2px, transparent 2px)`,
          backgroundSize: "240px 240px",
          backgroundPosition: `-1px ${-(frame * 0.6) % 240}px`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: glowX - 700,
          top: glowY - 700,
          width: 1400,
          height: 1400,
          borderRadius: "50%",
          background: `radial-gradient(circle, rgba(105,194,126,${0.16 * glowStrength}) 0%, rgba(105,194,126,${0.05 * glowStrength}) 35%, transparent 65%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: "radial-gradient(130% 85% at 50% 42%, transparent 50%, rgba(8,9,8,0.62) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
