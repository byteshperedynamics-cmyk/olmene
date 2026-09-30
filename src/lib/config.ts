/** App-wide configuration — mirrors the deployed Olmene stack. */

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://ffoevhldpppyfsfgufmx.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_CQJaLHGkc60GML5ccdWfdQ_8wO6PdTq";
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://olmene.com";

export const APP_NAME = "Olmene";
export const APP_TAGLINE = "Know exactly what to fix to get more customers";
export const APP_DESCRIPTION =
  "Olmene researches your website, market and competitors, then hands you a cited, prioritized 90-day marketing plan you can actually execute this week.";
/** GA4 measurement ID — analytics only loads after the visitor accepts cookies. */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-P6X5RFQG7W";

export const WAIT_POLL_MS = 30_000;
export const ADVANCE_MAX_BACKOFF_MS = 30_000;

export function fnUrl(name: string, params: URLSearchParams = new URLSearchParams()): string {
  return `${SUPABASE_URL}/functions/v1/${name}${params.toString() ? `?${params}` : ""}`;
}

// Number of deterministic checks the free audit runs (must match the
// free-audit edge function's buildChecklist — verified 21 as of 2026-10-01).
export const CHECK_COUNT = 21;
