/** App-wide configuration — mirrors the deployed Olmene stack. */

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://ffoevhldpppyfsfgufmx.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_CQJaLHGkc60GML5ccdWfdQ_8wO6PdTq";
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://olmene.com";

export const APP_NAME = "Olmene";
export const APP_TAGLINE = "Get found on Google and in AI answers";
export const APP_DESCRIPTION =
  "Olmene checks the search basics your site is missing for Google and AI answers, then writes the fixes as pull requests you review. Free scan, about 30 seconds.";
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
/**
 * Contact addresses. The owner wants support@ and security@olmene.com, but
 * olmene.com has no MX records yet (2026-10-13), so mail to them would bounce.
 * Until Cloudflare Email Routing forwards both to the studio mailbox, the site
 * shows the studio mailbox (spelled "byteshpere"). Then switch these two lines
 * to "support@olmene.com" and "security@olmene.com". null hides contact links.
 */
const STUDIO_MAILBOX = "byteshpere.dynamics@gmail.com";
export const SUPPORT_EMAIL: string | null = STUDIO_MAILBOX;
export const SECURITY_EMAIL: string | null = STUDIO_MAILBOX;
