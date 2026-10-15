import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { jsonError, requireUser } from "@/lib/agent/http";
import { AVATAR_BUCKET, avatarUrl } from "@/lib/account/server";

export const dynamic = "force-dynamic";

const MAX_BYTES = 1_048_576; // the browser sends a 512px square, usually 20–80 KB

/** The image type from its first bytes (never trust the header alone). */
function sniff(b: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;

/** Google's profile photo for this account, as a 512px square (only Google-hosted URLs). */
async function providerPhoto(userId: string): Promise<Uint8Array | null> {
  const { data } = await getServiceDb().auth.admin.getUserById(userId);
  const meta = (data?.user?.user_metadata ?? {}) as { avatar_url?: unknown; picture?: unknown };
  const raw = typeof meta.avatar_url === "string" ? meta.avatar_url : typeof meta.picture === "string" ? meta.picture : null;
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".googleusercontent.com")) return null;
  const sized = url.toString().replace(/=s\d+(-c)?$/, "") + "=s512-c";
  const res = await fetch(sized, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer());
  return buf.byteLength <= MAX_BYTES ? buf : null;
}

async function replaceAvatar(userId: string, bytes: Uint8Array): Promise<NextResponse> {
  const type = sniff(bytes);
  if (!type) return jsonError(415, "bad_image", "Use a JPEG, PNG or WebP image.");
  const db = getServiceDb();
  const { data: before } = await db.from("profiles").select("avatar_path").eq("id", userId).maybeSingle();
  const path = `${userId}/${crypto.randomUUID().slice(0, 12)}.${EXT[type]}`;
  const up = await db.storage.from(AVATAR_BUCKET).upload(path, bytes, { contentType: type, cacheControl: "31536000", upsert: false });
  if (up.error) return jsonError(500, "upload_failed", "Couldn't save your photo. Try again in a moment.");
  const { error } = await db.from("profiles").update({ avatar_path: path, updated_at: new Date().toISOString() }).eq("id", userId);
  if (error) {
    await db.storage.from(AVATAR_BUCKET).remove([path]);
    return jsonError(500, "upload_failed", "Couldn't save your photo. Try again in a moment.");
  }
  const old = (before as { avatar_path: string | null } | null)?.avatar_path;
  if (old && old !== path) await db.storage.from(AVATAR_BUCKET).remove([old]);
  return NextResponse.json({ ok: true, avatarPath: path, avatarUrl: avatarUrl(path) });
}

/**
 * POST /api/account/avatar/ — a new profile picture. Either the image itself
 * (Content-Type image/jpeg, image/png or image/webp; at most 1 MB) or
 * { "from": "google" } to copy the photo from the Google account.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const ctype = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();

  if (ctype === "application/json") {
    const body = (await req.json().catch(() => null)) as { from?: unknown } | null;
    if (body?.from !== "google") return jsonError(400, "bad_request", "Send an image, or { \"from\": \"google\" }.");
    const bytes = await providerPhoto(auth.user.id);
    if (!bytes) return jsonError(404, "no_provider_photo", "There's no Google photo on this account. Upload one instead.");
    return replaceAvatar(auth.user.id, bytes);
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(ctype)) return jsonError(415, "bad_image", "Use a JPEG, PNG or WebP image.");
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BYTES) return jsonError(413, "too_large", "That image is over 1 MB. Choose a smaller one.");
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.byteLength) return jsonError(400, "bad_image", "That file is empty.");
  if (bytes.byteLength > MAX_BYTES) return jsonError(413, "too_large", "That image is over 1 MB. Choose a smaller one.");
  return replaceAvatar(auth.user.id, bytes);
}

/** DELETE /api/account/avatar/ — back to initials. */
export async function DELETE(req: Request) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const db = getServiceDb();
  const { data } = await db.from("profiles").select("avatar_path").eq("id", auth.user.id).maybeSingle();
  const old = (data as { avatar_path: string | null } | null)?.avatar_path;
  await db.from("profiles").update({ avatar_path: null, updated_at: new Date().toISOString() }).eq("id", auth.user.id);
  if (old) await db.storage.from(AVATAR_BUCKET).remove([old]);
  return NextResponse.json({ ok: true });
}
