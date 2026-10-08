import { C } from "../theme";

/** Check mark drawn by `draw` (0..1), like the site's check-ring. */
export const CheckIcon: React.FC<{ size: number; color?: string; draw?: number; stroke?: number }> = ({
  size,
  color = C.leaf,
  draw = 1,
  stroke = 3,
}) => (
  <svg viewBox="0 0 24 24" width={size} height={size} style={{ overflow: "visible" }}>
    <path
      d="M4.5 12.5l5 5 10-11"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={1 - draw}
    />
  </svg>
);

export const CrossIcon: React.FC<{ size: number; color?: string; stroke?: number }> = ({ size, color = C.rust, stroke = 3 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size}>
    <path d="M6 6l12 12M18 6L6 18" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
  </svg>
);

export const ArrowIcon: React.FC<{ size: number; color?: string; stroke?: number }> = ({ size, color = "currentColor", stroke = 2.4 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size}>
    <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** macOS-style pointer. Its hotspot is the top-left corner of the box. */
export const Cursor: React.FC<{ x: number; y: number; press?: number; opacity?: number }> = ({ x, y, press = 0, opacity = 1 }) => (
  <svg
    viewBox="0 0 28 34"
    width={56}
    height={68}
    style={{
      position: "absolute",
      left: x,
      top: y,
      opacity,
      scale: `${1 - press * 0.12}`,
      transformOrigin: "0 0",
      filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.45))",
      overflow: "visible",
    }}
  >
    <path
      d="M2 2 L2 27 L8.5 21 L13 31.5 L17.5 29.5 L13 19.5 L22 19.5 Z"
      fill="#FFFFFF"
      stroke="#111"
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  </svg>
);
