"use client";

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/config";
import { getSupabase } from "@/lib/supabase";
import { safeNextPath } from "@/lib/safe-next";

/**
 * Browser half of "Continue with Google" (server half and the full flow:
 * lib/auth/google-signin.ts). The raw nonce stays in this tab's
 * sessionStorage; Google only ever sees its SHA-256.
 */

const NONCE_KEY = "olm_google_nonce";

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Navigates to /api/auth/google/. Throws if this browser can't hold the nonce. */
export async function startGoogleSignIn(nextPath: string, lang: string): Promise<void> {
  const raw = hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
  window.sessionStorage.setItem(NONCE_KEY, raw);
  const hashed = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));
  const q = new URLSearchParams({ next: nextPath, nonce: hashed, hl: lang === "zh" ? "zh-CN" : lang });
  window.location.assign(`/api/auth/google/?${q}`);
}

/** The ID token the callback put in the URL fragment, if this page load is a return from Google. */
export function readGoogleReturn(): { token: string; next: string } | null {
  if (typeof window === "undefined" || !window.location.hash.includes("google_id_token=")) return null;
  const p = new URLSearchParams(window.location.hash.slice(1));
  const token = p.get("google_id_token");
  return token ? { token, next: safeNextPath(p.get("next")) } : null;
}

/** Exchanges the Google ID token for a Supabase session. Returns an auth_error code on failure. */
export async function finishGoogleSignIn(token: string): Promise<string | null> {
  let nonce: string | null = null;
  try {
    nonce = window.sessionStorage.getItem(NONCE_KEY);
    window.sessionStorage.removeItem(NONCE_KEY);
  } catch {
    /* storage blocked: handled below */
  }
  // Finished in a different tab or browser than the one that started it.
  if (!nonce) return "google_failed";
  const { error } = await getSupabase()!.auth.signInWithIdToken({ provider: "google", token, nonce });
  return error ? "google_failed" : null;
}

/** Whether Google is switched on in Supabase Auth (public settings endpoint). */
export async function googleSignInEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } });
    if (!res.ok) return true; // don't hide the button on a transient error
    const s = (await res.json()) as { external?: { google?: boolean } };
    return s.external?.google === true;
  } catch {
    return true;
  }
}
