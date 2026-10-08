import { Fragment } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C, CLAMP, EASE, FONT } from "../theme";

export type Seg = {
  text: string;
  /** leaf = the brand emphasis (the site's <em>), rust = a problem. */
  tone?: "fg" | "leaf" | "rust";
  italic?: boolean;
  /** Force a line break after this segment. */
  br?: boolean;
};

const TONE = { fg: C.fg, leaf: C.leaf, rust: C.rust } as const;

/**
 * Display headline in the site's .o-display style (Newsreader 500, -0.01em),
 * revealed word by word: each word rises out of its own mask. Optional exit
 * lifts the words away again so a new line can take their place.
 */
export const Headline: React.FC<{
  segs: Seg[];
  at: number;
  stagger?: number;
  exitAt?: number;
  size?: number;
  top: number;
  style?: React.CSSProperties;
}> = ({ segs, at, stagger = 3, exitAt, size = 104, top, style }) => {
  const frame = useCurrentFrame();
  let index = 0;

  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 80,
        right: 80,
        textAlign: "center",
        textWrap: "balance",
        fontFamily: FONT.display,
        fontWeight: 500,
        fontSize: size,
        lineHeight: 1.04,
        letterSpacing: "-0.012em",
        color: C.fg,
        ...style,
      }}
    >
      {segs.map((seg, s) => (
        <Fragment key={s}>
          {seg.text.split(" ").map((word, w) => {
            const i = index++;
            const start = at + i * stagger;
            const enter = interpolate(frame, [start, start + 18], [0, 1], { ...CLAMP, easing: EASE });
            const leave =
              exitAt === undefined ? 0 : interpolate(frame, [exitAt + i * 1.5, exitAt + i * 1.5 + 12], [0, 1], { ...CLAMP, easing: EASE });
            return (
              <Fragment key={w}>
                {w > 0 || s > 0 ? " " : null}
                <span
                  style={{
                    display: "inline-block",
                    overflow: "hidden",
                    verticalAlign: "top",
                    // Room for italic overhangs and descenders inside the mask.
                    padding: "0.06em 0.12em 0.2em",
                    margin: "-0.06em -0.12em -0.2em",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      fontStyle: seg.italic ? "italic" : "normal",
                      color: TONE[seg.tone ?? "fg"],
                      translate: `0 ${(1 - enter) * 115 - leave * 115}%`,
                      rotate: `${(1 - enter) * 4}deg`,
                      opacity: enter * (1 - leave),
                    }}
                  >
                    {word}
                  </span>
                </span>
              </Fragment>
            );
          })}
          {seg.br ? <br /> : null}
        </Fragment>
      ))}
    </div>
  );
};
