/**
 * "Continue with Google" — server half of the sign-in flow.
 *
 * Why not supabase.auth.signInWithOAuth: that flow sends Google a redirect URI
 * on <project>.supabase.co, so Google's account chooser tells customers they
 * are signing in to "ffoevhldpppyfsfgufmx.supabase.co". Here the redirect URI
 * is on our own domain, so Google shows olmene.com, and the Google ID token is
 * handed to Supabase with signInWithIdToken (which checks signature, audience
 * and nonce).
 *
 *   browser                        /api/auth/google/            Google
 *   ── random nonce (sessionStorage), sha256 → ?nonce= ──▶
 *                                  state + PKCE verifier in an HttpOnly cookie,
 *                                  302 ───────────────────────────────────▶ consent
 *                                  /api/auth/google/callback/ ◀── ?code&state
 *                                  check state, exchange code (+secret,
 *                                  verifier) → id_token
 *   /login/#google_id_token=…  ◀── 303
 *   signInWithIdToken({ token, nonce: raw nonce from sessionStorage })
 *
 * The raw nonce never leaves the tab that started the flow, so an ID token
 * seen anywhere else (history, logs) cannot be replayed into a session.
 *
 * Env: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (Worker secrets; the same OAuth
 * client Measure uses). Scopes are the non-sensitive openid + email + profile.
 */
import { getEnv } from "@/lib/agent/env";
import { safeNextPath } from "@/lib/safe-next";

export const SIGNIN_SCOPE = "openid email profile";
export const STATE_COOKIE = "olm_google_signin";
export const STATE_COOKIE_PATH = "/api/auth/google/";
export const STATE_TTL_SECONDS = 600;

export type Fetch = typeof fetch;

export function googleSignInClient(): { id: string; secret: string } | null {
  const id = getEnv("GOOGLE_CLIENT_ID");
  const secret = getEnv("GOOGLE_CLIENT_SECRET");
  return id && secret ? { id, secret } : null;
}

/** In-app paths only (never another origin); shared with the browser half and the login page. */
export { safeNextPath };

/** sha256(raw nonce) as lowercase hex, which is what Supabase compares against. */
export function isHashedNonce(v: string | null): v is string {
  return !!v && /^[a-f0-9]{64}$/.test(v);
}

/** Google UI language hint (hl), e.g. "el" or "pt-BR". */
export function safeLocale(v: string | null): string | null {
  return v && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(v) ? v : null;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

export type SignInState = { state: string; verifier: string; next: string };

export function encodeState(s: SignInState): string {
  return b64url(new TextEncoder().encode(JSON.stringify(s)));
}

export function decodeState(raw: string | undefined | null): SignInState | null {
  if (!raw) return null;
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const v = JSON.parse(json) as Partial<SignInState>;
    if (typeof v.state !== "string" || typeof v.verifier !== "string" || typeof v.next !== "string") return null;
    return { state: v.state, verifier: v.verifier, next: safeNextPath(v.next) };
  } catch {
    return null;
  }
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function stateCookie(value: string, maxAge = STATE_TTL_SECONDS): string {
  return `${STATE_COOKIE}=${value}; Path=${STATE_COOKIE_PATH}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function authorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
  nonce: string;
  hl?: string | null;
}): string {
  const p = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: SIGNIN_SCOPE,
    state: opts.state,
    nonce: opts.nonce,
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
    // People often have a work and a personal Google account: always let them pick.
    prompt: "select_account",
  });
  if (opts.hl) p.set("hl", opts.hl);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

/** Authorization code → Google ID token (a JWT Supabase verifies). */
export async function exchangeForIdToken(
  client: { id: string; secret: string },
  code: string,
  verifier: string,
  redirectUri: string,
  f: Fetch = fetch,
): Promise<string> {
  const res = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: client.id,
      client_secret: client.secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }).toString(),
  });
  if (!res.ok) throw new Error(`google token endpoint returned ${res.status}`);
  const t = (await res.json()) as { id_token?: string };
  if (!t.id_token) throw new Error("google returned no id_token");
  return t.id_token;
}
