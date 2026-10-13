/**
 * Webflow channel (engine v2): apply approved head fixes through the Webflow
 * Data API v2 instead of a pull request, then publish.
 *
 * Auth: a site API token the customer creates in Webflow (Site settings →
 * Apps & integrations → API access) with Pages: read & write and Sites:
 * read & write (for publishing). Stored envelope-encrypted on a connections
 * row; it never leaves the Worker.
 *
 * What it changes: the homepage's SEO title and meta description, and its
 * Open Graph title and description. Everything else stays a guided step.
 * Every change keeps the value it replaced, so revert puts it back.
 */

import type { CopyDrafts } from "../fixers";
import type { AutoPlan, ChannelError, FetchLike } from "./types";
import { channelError } from "./types";

const API = "https://api.webflow.com/v2";

export interface WebflowSite {
  id: string;
  displayName?: string;
  shortName?: string;
  customDomains?: Array<{ id: string; url: string }>;
}

export interface WebflowPage {
  id: string;
  title?: string;
  slug?: string;
  parentId?: string | null;
  collectionId?: string | null;
  draft?: boolean;
  archived?: boolean;
  publishedPath?: string | null;
  seo?: { title?: string | null; description?: string | null };
  openGraph?: { title?: string | null; titleCopied?: boolean; description?: string | null; descriptionCopied?: boolean };
}

async function wf<T>(fetchFn: FetchLike, token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetchFn(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw channelError("webflow", res.status, text);
  }
  return (await res.json().catch(() => ({}))) as T;
}

export async function webflowSites(fetchFn: FetchLike, token: string): Promise<WebflowSite[]> {
  const out = await wf<{ sites?: WebflowSite[] }>(fetchFn, token, "GET", "/sites");
  return out.sites ?? [];
}

const hostOf = (u: string) => {
  try {
    return new URL(/^https?:\/\//.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/** The Webflow site serving siteUrl (custom domain or *.webflow.io), or null. */
export function matchWebflowSite(sites: WebflowSite[], siteUrl: string): WebflowSite | null {
  const host = hostOf(siteUrl);
  return sites.find((s) => (s.customDomains ?? []).some((d) => hostOf(d.url) === host))
    ?? sites.find((s) => s.shortName && `${s.shortName}.webflow.io` === host)
    ?? null;
}

/** The static homepage: no parent, not a CMS template, slug "" / "index" or published at "/". */
export function webflowHomePage(pages: WebflowPage[]): WebflowPage | null {
  const candidates = pages.filter((p) => !p.parentId && !p.collectionId && !p.archived && !p.draft);
  return candidates.find((p) => p.publishedPath === "/") ?? candidates.find((p) => p.slug === "" || p.slug === "index") ?? null;
}

export async function webflowPages(fetchFn: FetchLike, token: string, siteId: string): Promise<WebflowPage[]> {
  const out = await wf<{ pages?: WebflowPage[] }>(fetchFn, token, "GET", `/sites/${encodeURIComponent(siteId)}/pages?limit=100`);
  return out.pages ?? [];
}

/** Changes per fix id for the fixes Webflow can apply. */
export function planWebflow(fixIds: string[], site: WebflowSite, page: WebflowPage, copy: CopyDrafts): Map<string, AutoPlan> {
  const plans = new Map<string, AutoPlan>();
  const target = { siteId: site.id, pageId: page.id, domains: (site.customDomains ?? []).map((d) => d.id) };
  if (fixIds.includes("title-tag") && copy.title) {
    plans.set("title-tag", { channel: "webflow", target, changes: [{ field: "seo.title", label: "SEO title", before: page.seo?.title ?? null, after: copy.title }] });
  }
  if (fixIds.includes("meta-description") && copy.metaDescription) {
    plans.set("meta-description", { channel: "webflow", target, changes: [{ field: "seo.description", label: "Meta description", before: page.seo?.description ?? null, after: copy.metaDescription }] });
  }
  if (fixIds.includes("social-meta")) {
    const title = copy.title ?? page.seo?.title ?? page.title;
    const description = copy.metaDescription ?? page.seo?.description ?? null;
    const changes = [
      ...(title ? [{ field: "openGraph.title", label: "Open Graph title", before: page.openGraph?.titleCopied ? null : page.openGraph?.title ?? null, after: title }] : []),
      ...(description ? [{ field: "openGraph.description", label: "Open Graph description", before: page.openGraph?.descriptionCopied ? null : page.openGraph?.description ?? null, after: description }] : []),
    ];
    if (changes.length) plans.set("social-meta", { channel: "webflow", target, changes });
  }
  return plans;
}

/** The PUT body for a set of field values. */
export function webflowPageBody(values: Array<{ field: string; value: string | null }>): Record<string, unknown> {
  const seo: Record<string, unknown> = {};
  const og: Record<string, unknown> = {};
  for (const v of values) {
    if (v.field === "seo.title") seo.title = v.value ?? "";
    if (v.field === "seo.description") seo.description = v.value ?? "";
    if (v.field === "openGraph.title") {
      og.title = v.value ?? "";
      og.titleCopied = v.value === null;
    }
    if (v.field === "openGraph.description") {
      og.description = v.value ?? "";
      og.descriptionCopied = v.value === null;
    }
  }
  return { ...(Object.keys(seo).length ? { seo } : {}), ...(Object.keys(og).length ? { openGraph: og } : {}) };
}

/**
 * Write the values (after = apply, before = revert) to the page, then publish
 * the site. Publishing is rate-limited by Webflow (about once a minute); a
 * failed publish is reported, the saved change stays.
 */
export async function writeWebflow(
  fetchFn: FetchLike,
  token: string,
  plans: AutoPlan[],
  direction: "apply" | "revert",
): Promise<{ ok: boolean; published: boolean; error?: string }> {
  if (!plans.length) return { ok: true, published: false };
  const target = plans[0].target as { siteId: string; pageId: string; domains: string[] };
  const values = plans.flatMap((p) => p.changes.map((c) => ({ field: c.field, value: direction === "apply" ? c.after : c.before })));
  try {
    await wf(fetchFn, token, "PUT", `/pages/${encodeURIComponent(target.pageId)}`, webflowPageBody(values));
  } catch (e) {
    return { ok: false, published: false, error: (e as ChannelError).message };
  }
  try {
    await wf(fetchFn, token, "POST", `/sites/${encodeURIComponent(target.siteId)}/publish`, target.domains.length ? { customDomains: target.domains, publishToWebflowSubdomain: false } : { publishToWebflowSubdomain: true });
    return { ok: true, published: true };
  } catch (e) {
    return { ok: true, published: false, error: `Saved in Webflow, but publishing failed (${(e as ChannelError).message}). Publish from the Designer.` };
  }
}
