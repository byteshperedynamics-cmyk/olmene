import { NextResponse } from "next/server";
import { absoluteUrl } from "@/lib/agent/env";
import {
  authorizeUrl,
  encodeState,
  googleSignInClient,
  isHashedNonce,
  pkceChallenge,
  randomToken,
  safeLocale,
  safeNextPath,
  stateCookie,
} from "@/lib/auth/google-signin";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

/**
 * GET /api/auth/google/?next=/app/&nonce=<sha256 hex>&hl=el
 * Starts "Continue with Google": state + PKCE verifier go into a short-lived
 * HttpOnly cookie, the browser goes to Google's account chooser.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const toLogin = (code: string) =>
    NextResponse.redirect(absoluteUrl(`/login/?auth_error=${code}`), { status: 303, headers: NO_STORE });

  const client = googleSignInClient();
  if (!client) return toLogin("google_unavailable");
  const nonce = url.searchParams.get("nonce");
  if (!isHashedNonce(nonce)) return toLogin("google_failed");

  const state = randomToken(24);
  const verifier = randomToken(48);
  const location = authorizeUrl({
    clientId: client.id,
    redirectUri: absoluteUrl("/api/auth/google/callback/"),
    state,
    challenge: await pkceChallenge(verifier),
    nonce,
    hl: safeLocale(url.searchParams.get("hl")),
  });

  const res = NextResponse.redirect(location, { status: 302, headers: NO_STORE });
  res.headers.append(
    "Set-Cookie",
    stateCookie(encodeState({ state, verifier, next: safeNextPath(url.searchParams.get("next")) })),
  );
  return res;
}
