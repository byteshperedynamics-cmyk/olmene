"use client";

/**
 * Client side of the account section. The profile row is read straight from
 * Supabase (RLS: your own row); every write goes through /api/account/*,
 * which uses the service role (account/server.ts).
 */

import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";
import { getSupabase } from "./supabase";
import { workspaceHeader } from "./workspace/client";
import { firstName, initials, type SiteProgress } from "./account/progress";

export class AccountError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "AccountError";
  }
}

async function token(): Promise<string> {
  const session = (await getSupabase()?.auth.getSession())?.data.session;
  return session?.access_token ?? "";
}

async function call<T>(method: string, path: string, body?: unknown, init?: { raw?: Blob }): Promise<T> {
  const t = await token();
  const res = await fetch(path, {
    method,
    headers: {
      ...(init?.raw ? { "Content-Type": init.raw.type } : body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...workspaceHeader(),
    },
    body: init?.raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401) throw new AccountError(401, "unauthorized", "You've been signed out. Sign in again to continue.");
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new AccountError(res.status, err?.code ?? "request_failed", err?.message ?? "Something went wrong. Try again in a moment.");
  }
  return data as T;
}

// ── Profile ────────────────────────────────────────────────────────────────

export interface ProfileRow {
  display_name: string | null;
  avatar_path: string | null;
  notify_email: boolean;
  digest_email: boolean;
  onboarded_at: string | null;
  created_at: string | null;
}

export function avatarSrc(path: string | null | undefined): string | null {
  return path ? `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}` : null;
}

async function readProfile(): Promise<ProfileRow | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, avatar_path, notify_email, digest_email, onboarded_at, created_at")
    .maybeSingle();
  if (error) return null;
  return data as ProfileRow | null;
}

/** Your profile row (cached; refreshed after every account change). */
export function useProfile(session: Session | null) {
  return useQuery({
    queryKey: ["profile", session?.user.id ?? null],
    queryFn: readProfile,
    enabled: !!session,
    staleTime: 60_000,
  });
}

/** Who's signed in, as the interface shows them: profile first, then the sign-in provider, then the email. */
export interface Identity {
  name: string | null;
  firstName: string | null;
  email: string | null;
  avatarUrl: string | null;
  /** The photo from Google, when the account has one and no picture of its own. */
  providerAvatarUrl: string | null;
  initials: string;
  providers: string[];
  createdAt: string | null;
  lastSignInAt: string | null;
}

export function identityOf(session: Session | null, profile: ProfileRow | null | undefined): Identity | null {
  if (!session) return null;
  const u = session.user;
  const meta = (u.user_metadata ?? {}) as { full_name?: unknown; name?: unknown; avatar_url?: unknown; picture?: unknown };
  const metaName = typeof meta.full_name === "string" ? meta.full_name : typeof meta.name === "string" ? meta.name : null;
  const metaPhoto = typeof meta.avatar_url === "string" ? meta.avatar_url : typeof meta.picture === "string" ? meta.picture : null;
  const name = profile?.display_name ?? metaName ?? null;
  const own = avatarSrc(profile?.avatar_path);
  const providers = Array.isArray(u.app_metadata?.providers) ? (u.app_metadata.providers as string[]) : u.app_metadata?.provider ? [String(u.app_metadata.provider)] : [];
  return {
    name,
    firstName: firstName(name, u.email),
    email: u.email ?? null,
    avatarUrl: own ?? metaPhoto,
    providerAvatarUrl: metaPhoto,
    initials: initials(name, u.email),
    providers,
    createdAt: profile?.created_at ?? u.created_at ?? null,
    lastSignInAt: u.last_sign_in_at ?? null,
  };
}

export function updateProfile(patch: { displayName?: string | null; notifyEmail?: boolean; digestEmail?: boolean; onboarded?: boolean }) {
  return call<{ ok: true; profile: Partial<ProfileRow> }>("PATCH", "/api/account/", patch);
}

export function uploadAvatar(image: Blob) {
  return call<{ ok: true; avatarPath: string; avatarUrl: string }>("POST", "/api/account/avatar/", undefined, { raw: image });
}

export function avatarFromGoogle() {
  return call<{ ok: true; avatarPath: string; avatarUrl: string }>("POST", "/api/account/avatar/", { from: "google" });
}

export function removeAvatar() {
  return call<{ ok: true }>("DELETE", "/api/account/avatar/");
}

// ── Overview, sharing ──────────────────────────────────────────────────────

export interface ShareLink {
  siteId: string;
  slug: string;
  showName: boolean;
  views: number;
  createdAt: string;
}

export interface AccountOverview {
  sites: SiteProgress[];
  totals: { reports: number; fixesShipped: number; sites: number };
  shares: ShareLink[];
  plan: { renews: boolean; renewsAt: string | null };
}

export function getOverview() {
  return call<AccountOverview>("GET", "/api/account/");
}

type ShareRow = { slug: string; show_name: boolean; views: number; created_at: string };

export async function createShare(siteId: string, showName: boolean): Promise<ShareLink> {
  const { share } = await call<{ share: ShareRow }>("POST", "/api/account/shares/", { siteId, showName });
  return { siteId, slug: share.slug, showName: share.show_name, views: share.views, createdAt: share.created_at };
}

export async function setShareName(siteId: string, showName: boolean): Promise<ShareLink> {
  const { share } = await call<{ share: ShareRow }>("PATCH", "/api/account/shares/", { siteId, showName });
  return { siteId, slug: share.slug, showName: share.show_name, views: share.views, createdAt: share.created_at };
}

export function deleteShare(siteId: string) {
  return call<{ ok: true }>("DELETE", "/api/account/shares/", { siteId });
}

export function shareUrl(slug: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://olmene.com";
  return `${origin}/p/${slug}/`;
}

// ── Your data ──────────────────────────────────────────────────────────────

/** Downloads everything Olmene keeps about you as a JSON file. */
export async function downloadMyData(): Promise<void> {
  const t = await token();
  const res = await fetch("/api/account/data/", { headers: t ? { Authorization: `Bearer ${t}` } : {} });
  if (!res.ok) throw new AccountError(res.status, "export_failed", "Couldn't prepare your download. Try again in a moment.");
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "olmene-data.json";
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function deleteMyData() {
  return call<{ ok: true }>("DELETE", "/api/account/data/", { confirm: "delete" });
}

export function deleteMyAccount(email: string) {
  return call<{ ok: true }>("DELETE", "/api/account/", { confirm: email });
}

// ── Images ─────────────────────────────────────────────────────────────────

/**
 * Draws the visible part of an image (the crop the user chose) into a
 * 512-pixel square and encodes it: WebP where the browser can, JPEG otherwise.
 */
export async function renderSquare(
  img: CanvasImageSource & { width: number; height: number },
  crop: { x: number; y: number; size: number },
  out = 512,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new AccountError(0, "no_canvas", "This browser can't prepare the photo. Try another browser.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, crop.x, crop.y, crop.size, crop.size, 0, 0, out, out);
  const as = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
  const webp = await as("image/webp", 0.86);
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await as("image/jpeg", 0.88);
  if (!jpeg) throw new AccountError(0, "encode_failed", "Couldn't prepare the photo. Try a different image.");
  return jpeg;
}
