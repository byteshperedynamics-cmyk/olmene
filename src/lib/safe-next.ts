/**
 * Where to send someone after they sign in: a path on this site, never
 * another one. Used by the login page, the Google sign-in round trip and the
 * server route that starts it, so every hop applies the same rule.
 *
 * `startsWith("/") && !startsWith("//")` isn't enough on its own: browsers
 * drop tabs and line breaks from URLs and read "\" as "/", so "/\evil.example"
 * and "/<tab>/evil.example" (from ?next=/%09/evil.example) both open
 * evil.example. The path is parsed against a placeholder origin and kept only
 * if it stays there.
 */

const ORIGIN = "https://olmene.invalid";

export function safeNextPath(raw: string | null | undefined, fallback = "/app/"): string {
  if (typeof raw !== "string" || !raw || raw.length > 512) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  // Backslashes, control characters and whitespace have no business in a path we built.
  if (/[\\\u0000- \u007f]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== ORIGIN) return fallback;
  return url.pathname + url.search + url.hash;
}
