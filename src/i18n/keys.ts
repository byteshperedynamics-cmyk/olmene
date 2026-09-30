/**
 * Static maps from API/report enum values to dictionary keys.
 *
 * Report data (free-audit findings, sample report, real reports) carries
 * English enum values like severity:"high" or status:"pass". The render
 * layer maps them through these dictionaries so chips and labels display in
 * the visitor's language while the underlying data stays unchanged.
 * Unknown values fall back to the raw value (never crash on new enums).
 */

export const SEVERITY_KEYS: Record<string, string> = {
  critical: "sev.critical",
  high: "sev.high",
  medium: "sev.medium",
  low: "sev.low",
};

export const STATUS_KEYS: Record<string, string> = {
  pass: "status.pass",
  warn: "status.warn",
  fail: "status.fail",
};

export const EFFORT_KEYS: Record<string, string> = {
  s: "rv.effort.small",
  small: "rv.effort.small",
  m: "rv.effort.medium",
  medium: "rv.effort.medium",
  l: "rv.effort.large",
  large: "rv.effort.large",
};

export const IMPACT_KEYS: Record<string, string> = {
  high: "rv.impact.high",
  medium: "rv.impact.medium",
  low: "rv.impact.low",
};

export const CONFIDENCE_KEYS: Record<string, string> = {
  high: "rv.confidence.high",
  medium: "rv.confidence.medium",
  low: "rv.confidence.low",
};

/** Score-band label used by the report viewer / print cover. */
export function scoreLabelKey(v: number): string {
  if (v >= 75) return "scores.strong";
  if (v >= 50) return "scores.developing";
  return "scores.needsWork";
}
