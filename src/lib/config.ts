/** App-wide configuration — mirrors the deployed Olmene stack. */

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://ffoevhldpppyfsfgufmx.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_CQJaLHGkc60GML5ccdWfdQ_8wO6PdTq";
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://olmene.com";

export const APP_NAME = "Olmene";
export const APP_TAGLINE = "Find what is costing you customers and ship the fix";
export const APP_DESCRIPTION =
  "Olmene finds what is costing your website customers, then opens a pull request that fixes it. Free scan in 30 seconds. Nothing merges without you.";
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

/** The independent studio that builds and operates Olmene (not a registered company). */
export const STUDIO_NAME = "Bytesphere_Dynamics";
/** Founder identity, verifiable — linked, never featured. */
export const FOUNDER_NAME = "Hermes Lekkas";
export const FOUNDER_LINKEDIN = "https://www.linkedin.com/in/hermes-lekkas-453722441/";
export const STUDIO_GITHUB = "https://github.com/byteshperedynamics-cmyk";
/** Support / security contact. null until the address is confirmed: contact links stay hidden. */
export const SUPPORT_EMAIL: string | null = null;
