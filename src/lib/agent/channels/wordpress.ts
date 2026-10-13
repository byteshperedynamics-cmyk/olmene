/**
 * WordPress channel (engine v2): apply approved fixes through the WordPress
 * REST API with an application password (Users → Profile → Application
 * Passwords; WordPress 5.6+). Stored envelope-encrypted; never leaves the
 * Worker.
 *
 * What it changes, only where the site exposes it:
 *  - image alt text in the Media Library (wp/v2/media);
 *  - the homepage's SEO title and description when Rank Math exposes its
 *    fields to the REST API (meta.rank_math_title / rank_math_description).
 * Yoast and AIOSEO keep their fields private to the REST API, so those stay
 * guided steps. Capabilities are read from the site, not assumed.
 */

import type { CopyDrafts } from "../fixers";
import { findImagesWithoutAlt } from "../htmlfile";
import { channelError, type AutoPlan, type ChannelError, type FetchLike } from "./types";

export interface WordpressCreds {
  siteUrl: string;
  username: string;
  appPassword: string;
}

function auth(c: WordpressCreds): string {
  const raw = `${c.username}:${c.appPassword.replace(/\s+/g, "")}`;
  const bytes = new TextEncoder().encode(raw);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `Basic ${btoa(bin)}`;
}

/** Normalised https origin + path of the WordPress install (no trailing slash). */
export function wordpressBase(siteUrl: string): string | null {
  try {
    const u = new URL(siteUrl);
    if (u.protocol !== "https:") return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

async function wp<T>(fetchFn: FetchLike, c: WordpressCreds, method: string, route: string, body?: unknown): Promise<T> {
  const base = wordpressBase(c.siteUrl);
  if (!base) throw channelError("wordpress", 400, '{"message":"the site address must start with https://"}');
  const headers = { Authorization: auth(c), accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) };
  const init = { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" as const, signal: AbortSignal.timeout(15_000) };
  let res = await fetchFn(`${base}/wp-json${route}`, init);
  // Sites without pretty permalinks only answer on ?rest_route=.
  if (res.status === 404) {
    await res.body?.cancel().catch(() => {});
    const [path, query] = route.split("?");
    res = await fetchFn(`${base}/?rest_route=${encodeURIComponent(path)}${query ? `&${query}` : ""}`, init);
  }
  if (res.status >= 300 && res.status < 400) {
    await res.body?.cancel().catch(() => {});
    throw channelError("wordpress", res.status, '{"message":"the site redirected the API request (check the address, e.g. www or https)"}');
  }
  if (!res.ok) throw channelError("wordpress", res.status, await res.text().catch(() => ""));
  return (await res.json().catch(() => ({}))) as T;
}

export interface WordpressAccount {
  id: number;
  name: string;
  canUpload: boolean;
  canEditPages: boolean;
  namespaces: string[];
}

/** Check the credentials and what this user may change. */
export async function verifyWordpress(fetchFn: FetchLike, c: WordpressCreds): Promise<WordpressAccount> {
  const me = await wp<{ id: number; name: string; capabilities?: Record<string, boolean> }>(fetchFn, c, "GET", "/wp/v2/users/me?context=edit");
  const index = await wp<{ namespaces?: string[] }>(fetchFn, c, "GET", "/").catch(() => ({ namespaces: [] as string[] }));
  return {
    id: me.id,
    name: me.name,
    canUpload: !!me.capabilities?.upload_files,
    canEditPages: !!(me.capabilities?.edit_pages || me.capabilities?.edit_others_pages),
    namespaces: index.namespaces ?? [],
  };
}

interface WpMedia { id: number; source_url: string; alt_text: string }
interface WpPage { id: number; link: string; meta?: Record<string, unknown> }

/** "photo-1024x768.jpg" → "photo" (WordPress resized copies share the original's name). */
export function mediaBaseName(src: string): string {
  const file = src.split("?")[0].split("/").pop() ?? "";
  return decodeURIComponent(file).replace(/\.[a-z0-9]+$/i, "").replace(/-\d+x\d+$/, "").replace(/-scaled$/, "");
}

async function findMedia(fetchFn: FetchLike, c: WordpressCreds, src: string): Promise<WpMedia | null> {
  const name = mediaBaseName(src);
  if (name.length < 2) return null;
  const list = await wp<WpMedia[]>(fetchFn, c, "GET", `/wp/v2/media?search=${encodeURIComponent(name)}&per_page=20&_fields=id,source_url,alt_text&context=edit`).catch(() => [] as WpMedia[]);
  return list.find((m) => mediaBaseName(m.source_url) === name) ?? null;
}

async function homepage(fetchFn: FetchLike, c: WordpressCreds): Promise<WpPage | null> {
  const settings = await wp<{ show_on_front?: string; page_on_front?: number }>(fetchFn, c, "GET", "/wp/v2/settings").catch(() => ({} as { show_on_front?: string; page_on_front?: number }));
  if (settings.show_on_front === "page" && settings.page_on_front) {
    return wp<WpPage>(fetchFn, c, "GET", `/wp/v2/pages/${settings.page_on_front}?context=edit&_fields=id,link,meta`).catch(() => null);
  }
  const base = wordpressBase(c.siteUrl)!;
  const pages = await wp<WpPage[]>(fetchFn, c, "GET", "/wp/v2/pages?per_page=100&context=edit&_fields=id,link,meta").catch(() => [] as WpPage[]);
  return pages.find((p) => p.link.replace(/\/+$/, "") === base) ?? null;
}

/** Changes per fix id for the fixes this WordPress site lets Olmene apply. */
export async function planWordpress(fetchFn: FetchLike, c: WordpressCreds, fixIds: string[], copy: CopyDrafts, liveHtml: string): Promise<Map<string, AutoPlan>> {
  const plans = new Map<string, AutoPlan>();
  if (fixIds.includes("image-alt") && copy.altTexts) {
    const changes: AutoPlan["changes"] = [];
    for (const img of findImagesWithoutAlt(liveHtml).slice(0, 12)) {
      const alt = img.src ? copy.altTexts[img.src] : undefined;
      if (!img.src || !alt) continue;
      const media = await findMedia(fetchFn, c, img.src);
      if (media) changes.push({ field: `media:${media.id}.alt_text`, label: `Alt text: ${mediaBaseName(img.src)}`, before: media.alt_text || null, after: alt });
    }
    if (changes.length) plans.set("image-alt", { channel: "wordpress", target: { kind: "media" }, changes });
  }
  if (fixIds.some((id) => id === "title-tag" || id === "meta-description")) {
    const page = await homepage(fetchFn, c);
    const meta = page?.meta ?? {};
    if (page && copy.title && fixIds.includes("title-tag") && "rank_math_title" in meta) {
      plans.set("title-tag", { channel: "wordpress", target: { kind: "page", pageId: page.id }, changes: [{ field: "meta.rank_math_title", label: "SEO title (Rank Math)", before: (meta.rank_math_title as string) || null, after: copy.title }] });
    }
    if (page && copy.metaDescription && fixIds.includes("meta-description") && "rank_math_description" in meta) {
      plans.set("meta-description", { channel: "wordpress", target: { kind: "page", pageId: page.id }, changes: [{ field: "meta.rank_math_description", label: "Meta description (Rank Math)", before: (meta.rank_math_description as string) || null, after: copy.metaDescription }] });
    }
  }
  return plans;
}

/** Write after (apply) or before (revert) values. */
export async function writeWordpress(fetchFn: FetchLike, c: WordpressCreds, plan: AutoPlan, direction: "apply" | "revert"): Promise<{ ok: boolean; error?: string }> {
  try {
    for (const ch of plan.changes) {
      const value = direction === "apply" ? ch.after : ch.before ?? "";
      const media = ch.field.match(/^media:(\d+)\.alt_text$/);
      if (media) {
        await wp(fetchFn, c, "POST", `/wp/v2/media/${media[1]}`, { alt_text: value });
        continue;
      }
      const meta = ch.field.match(/^meta\.([a-z_]+)$/);
      const pageId = (plan.target as { pageId?: number }).pageId;
      if (meta && pageId) {
        await wp(fetchFn, c, "POST", `/wp/v2/pages/${pageId}`, { meta: { [meta[1]]: value } });
        continue;
      }
      return { ok: false, error: `Unknown change ${ch.field}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as ChannelError).message };
  }
}
