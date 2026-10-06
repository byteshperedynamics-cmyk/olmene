import { NextResponse } from "next/server";
import { absoluteUrl } from "@/lib/agent/env";
import { agentLog } from "@/lib/agent/redact";
import {
  STATE_COOKIE,
  decodeState,
  exchangeForIdToken,
  googleSignInClient,
  readCookie,
  stateCookie,
} from "@/lib/auth/google-signin";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

/**
 * GET /api/auth/google/callback/?code=&state=   (or ?error=access_denied)
 * Checks state against the cookie, exchanges the code for a Google ID token
 * and hands it to /login/ in the URL fragment (never sent to a server), where
 * the tab that started the flow completes it with signInWithIdToken.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const saved = decodeState(readCookie(req.headers.get("cookie"), STATE_COOKIE));

  const redirect = (location: string) => {
    const res = NextResponse.redirect(location, { status: 303, headers: NO_STORE });
    res.headers.append("Set-Cookie", stateCookie("", 0)); // one use only
    return res;
  };
  const toLogin = (code: string) => redirect(absoluteUrl(`/login/?auth_error=${code}`));

  const error = url.searchParams.get("error");
  if (error) return toLogin(error === "access_denied" ? "google_cancelled" : "google_failed");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  // A missing cookie means the 10-minute window passed or a different browser finished the flow.
  if (!code || !state || !saved || saved.state !== state) return toLogin("google_failed");

  const client = googleSignInClient();
  if (!client) return toLogin("google_unavailable");

  try {
    const idToken = await exchangeForIdToken(client, code, saved.verifier, absoluteUrl("/api/auth/google/callback/"));
    const fragment = new URLSearchParams({ google_id_token: idToken, next: saved.next });
    return redirect(absoluteUrl(`/login/#${fragment}`));
  } catch (err) {
    agentLog("warn", "google sign-in: code exchange failed", { error: err instanceof Error ? err.message : String(err) });
    return toLogin("google_failed");
  }
}
