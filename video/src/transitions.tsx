import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { AbsoluteFill, interpolate } from "remotion";
import { C, CLAMP } from "./theme";

type NoProps = Record<string, never>;

/**
 * Scan wipe — the brand's scan beam as a cut: a leaf-green line sweeps down
 * the frame, the next scene appears above it and the last one stays below.
 * Both scenes are clipped so they never overlap (they share one background).
 */
const ScanWipe: React.FC<TransitionPresentationComponentProps<NoProps>> = ({
  children,
  presentationDirection,
  presentationProgress,
}) => {
  const edge = presentationProgress * 100;
  if (presentationDirection === "exiting") {
    return <AbsoluteFill style={{ clipPath: `inset(${edge}% 0 0 0)` }}>{children}</AbsoluteFill>;
  }
  const beamOpacity = interpolate(presentationProgress, [0, 0.08, 0.92, 1], [0, 1, 1, 0], CLAMP);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `inset(0 0 ${100 - edge}% 0)` }}>{children}</AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: `${edge}%`,
          height: 260,
          translate: "0 -100%",
          opacity: beamOpacity,
          background: `linear-gradient(to bottom, transparent, ${C.leafSoft} 70%, rgba(105,194,126,0.28))`,
          borderBottom: `4px solid ${C.leaf}`,
          boxShadow: `0 10px 40px 0 ${C.glow}`,
        }}
      />
    </AbsoluteFill>
  );
};

export const scanWipe = (): TransitionPresentation<NoProps> => ({ component: ScanWipe, props: {} });

/**
 * Zoom fade — the outgoing scene flies past the camera while the next one
 * settles in from slightly further away. Used into the end card.
 */
const ZoomFade: React.FC<TransitionPresentationComponentProps<NoProps>> = ({
  children,
  presentationDirection,
  presentationProgress: p,
}) => {
  if (presentationDirection === "exiting") {
    return (
      <AbsoluteFill
        style={{
          opacity: interpolate(p, [0, 0.75], [1, 0], CLAMP),
          scale: `${interpolate(p, [0, 1], [1, 1.15], CLAMP)}`,
          filter: `blur(${interpolate(p, [0, 1], [0, 12], CLAMP)}px)`,
        }}
      >
        {children}
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill
      style={{
        opacity: interpolate(p, [0.25, 0.85], [0, 1], CLAMP),
        scale: `${interpolate(p, [0, 1], [0.9, 1], CLAMP)}`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export const zoomFade = (): TransitionPresentation<NoProps> => ({ component: ZoomFade, props: {} });
