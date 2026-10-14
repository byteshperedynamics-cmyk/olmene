/**
 * API channels (engine v2): connect Webflow or WordPress once, then apply
 * approved guided fixes for the customer and undo them on request. Secrets
 * live envelope-encrypted on public.connections (provider 'webflow' /
 * 'wordpress'); plans and results on the guided run hold only ids and the
 * before/after values.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret, masterKeyFromEnv } from "../crypto";
import { getEnv } from "../env";
import { copyFromFixes, type GuidedFix } from "../guided/build";
import { fetchLiveHtml } from "../live-check";
import type { AutoPlan, AutoState, FetchLike } from "./types";
import { matchWebflowSite, planWebflow, webflowHomePage, webflowPages, webflowSites, writeWebflow, type WebflowSite } from "./webflow";
import { planWordpress, verifyWordpress, wordpressBase, writeWordpress, type WordpressCreds } from "./wordpress";

export type ChannelId = "webflow" | "wordpress";
export const CHANNEL_PLATFORMS: Record<string, ChannelId> = { webflow: "webflow", wordpress: "wordpress" };

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

async function masterKey(): Promise<CryptoKey> {
  const v = getEnv("MW_KMS_MASTER_KEY");
  if (!v) throw new Error("MW_KMS_MASTER_KEY is not set");
  return masterKeyFromEnv(v);
}

export interface SiteConnection {
  id: string;
  provider: ChannelId;
  host: string;
  metadata: Record<string, unknown>;
  secret: string;
}

/** Save (or replace) the user's connection for one site. */
export async function saveSiteConnection(db: SupabaseClient, userId: string, provider: ChannelId, host: string, secret: string, metadata: Record<string, unknown>): Promise<string> {
  const ciphertext = await encryptSecret(await masterKey(), secret);
  const row = {
    user_id: userId, provider, status: "active", provider_account_id: host, external_installation_id: host,
    metadata, secret_ciphertext: ciphertext, last_verified_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  const { data: existing } = await db.from("connections").select("id").eq("user_id", userId).eq("provider", provider).eq("external_installation_id", host).maybeSingle();
  const res = existing
    ? await db.from("connections").update(row).eq("id", existing.id).select("id").single()
    : await db.from("connections").insert(row).select("id").single();
  if (res.error || !res.data) throw new Error(`connection save failed: ${res.error?.message ?? "no row"}`);
  return (res.data as { id: string }).id;
}

/** The active connection for this user, platform and site host (decrypted), or null. */
export async function loadSiteConnection(db: SupabaseClient, userId: string, provider: ChannelId, siteUrl: string): Promise<SiteConnection | null> {
  const host = hostOf(siteUrl);
  const { data } = await db.from("connections").select("id, provider, external_installation_id, metadata, secret_ciphertext")
    .eq("user_id", userId).eq("provider", provider).eq("status", "active").eq("external_installation_id", host).maybeSingle();
  if (!data?.secret_ciphertext) return null;
  try {
    return { id: data.id, provider, host, metadata: (data.metadata ?? {}) as Record<string, unknown>, secret: await decryptSecret(await masterKey(), data.secret_ciphertext) };
  } catch {
    return null;
  }
}

export async function connectWebflow(fetchFn: FetchLike, token: string, siteUrl: string): Promise<{ site: WebflowSite; host: string }> {
  const sites = await webflowSites(fetchFn, token);
  const site = matchWebflowSite(sites, siteUrl) ?? (sites.length === 1 ? sites[0] : null);
  if (!site) throw new Error(sites.length ? `This token's Webflow sites don't include ${hostOf(siteUrl)}.` : "This token can't see any Webflow site. Create it from the site's settings (Apps & integrations → API access).");
  return { site, host: hostOf(siteUrl) };
}

export async function connectWordpress(fetchFn: FetchLike, creds: WordpressCreds): Promise<{ host: string; account: Awaited<ReturnType<typeof verifyWordpress>> }> {
  if (!wordpressBase(creds.siteUrl)) throw new Error("The WordPress address must start with https://");
  const account = await verifyWordpress(fetchFn, creds);
  if (!account.canUpload && !account.canEditPages) throw new Error("This WordPress user can't edit pages or media. Use an Editor or Administrator account.");
  return { host: hostOf(creds.siteUrl), account };
}

/** Plan automatic changes for a run's fixes; returns the fixes with `auto` set where possible. */
export async function attachAutoPlans(conn: SiteConnection, siteUrl: string, fixes: GuidedFix[], fetchFn: FetchLike): Promise<GuidedFix[]> {
  const ids = fixes.filter((f) => f.status !== "blocked" && !f.auto?.applied).map((f) => f.id);
  const copy = copyFromFixes(fixes);
  let plans = new Map<string, AutoPlan>();
  if (conn.provider === "webflow") {
    const sites = await webflowSites(fetchFn, conn.secret);
    const site = matchWebflowSite(sites, siteUrl) ?? sites.find((s) => s.id === conn.metadata.siteId) ?? null;
    if (!site) return fixes;
    const page = webflowHomePage(await webflowPages(fetchFn, conn.secret, site.id));
    if (!page) return fixes;
    plans = planWebflow(ids, site, page, copy);
  } else {
    const creds = JSON.parse(conn.secret) as WordpressCreds;
    const live = await fetchLiveHtml(siteUrl, fetchFn);
    plans = await planWordpress(fetchFn, creds, ids, copy, live?.html ?? "");
  }
  return fixes.map((f) => (plans.has(f.id) && !f.auto?.applied ? { ...f, auto: plans.get(f.id) as AutoState } : f));
}

/** Apply (or revert) the chosen fixes' automatic changes; returns the updated fixes. */
export async function runAutoChanges(conn: SiteConnection, fixes: GuidedFix[], fixIds: string[], direction: "apply" | "revert", fetchFn: FetchLike): Promise<GuidedFix[]> {
  const chosen = fixes.filter((f) => fixIds.includes(f.id) && f.auto && (direction === "apply" ? !f.auto.applied?.ok || !!f.auto.revertedAt : f.auto.applied?.ok && !f.auto.revertedAt));
  if (!chosen.length) return fixes;
  const now = new Date().toISOString();
  const results = new Map<string, AutoState>();
  if (conn.provider === "webflow") {
    // One page write and one publish for all chosen fields.
    const r = await writeWebflow(fetchFn, conn.secret, chosen.map((f) => f.auto!), direction);
    for (const f of chosen) {
      results.set(f.id, direction === "apply"
        ? { ...f.auto!, applied: { at: now, ok: r.ok, published: r.published, ...(r.error ? { error: r.error } : {}) }, revertedAt: undefined }
        : { ...f.auto!, ...(r.ok ? { revertedAt: now } : { applied: { ...f.auto!.applied!, error: r.error } }) });
    }
  } else {
    const creds = JSON.parse(conn.secret) as WordpressCreds;
    for (const f of chosen) {
      const r = await writeWordpress(fetchFn, creds, f.auto!, direction);
      results.set(f.id, direction === "apply"
        ? { ...f.auto!, applied: { at: now, ok: r.ok, ...(r.error ? { error: r.error } : {}) }, revertedAt: undefined }
        : { ...f.auto!, ...(r.ok ? { revertedAt: now } : { applied: { ...f.auto!.applied!, error: r.error } }) });
    }
  }
  return fixes.map((f) => (results.has(f.id) ? { ...f, auto: results.get(f.id) } : f));
}
