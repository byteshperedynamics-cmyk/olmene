/**
 * Server half of the account section: progress, sharing, export and
 * deletion. Every function takes the service-role client (agent/db.ts), so
 * import this only from Worker routes and server components.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/agent/env";
import { checklistProgress, shapeHistory, type SiteProgress } from "./progress";

export const AVATAR_BUCKET = "avatars";
const SHOT_BUCKET = "scan-shots";

/** Public URL of a stored profile picture. */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${supabaseUrl().replace(/\/+$/, "")}/storage/v1/object/public/${AVATAR_BUCKET}/${path}`;
}

interface SiteRow {
  id: string;
  url: string;
  host: string;
  monitor: boolean;
  created_at: string;
  last_score: number | null;
  last_checklist: unknown;
  ai_last: { mentionShare?: number } | null;
}

/**
 * Progress for the user's sites (all of them, or `siteIds`). Two queries for
 * the lot plus one per site for its first checklist, capped at 12 sites so a
 * Worker request stays well inside the subrequest limit.
 */
export async function loadSiteProgress(db: SupabaseClient, userId: string, siteIds?: string[]): Promise<SiteProgress[]> {
  let q = db
    .from("sites")
    .select("id, url, host, monitor, created_at, last_score, last_checklist, ai_last")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(12);
  if (siteIds?.length) q = q.in("id", siteIds);
  const { data: sites, error } = await q;
  if (error || !sites?.length) return [];
  const rows = sites as SiteRow[];
  const ids = rows.map((s) => s.id);

  const { data: scans } = await db
    .from("scans")
    .select("site_id, created_at, score:result->scores->overall")
    .in("site_id", ids)
    .order("created_at", { ascending: false })
    .limit(400);
  const bySite = new Map<string, { created_at: string; score: unknown }[]>();
  for (const s of (scans ?? []) as { site_id: string; created_at: string; score: unknown }[]) {
    const list = bySite.get(s.site_id) ?? [];
    list.push(s);
    bySite.set(s.site_id, list);
  }

  return Promise.all(
    rows.map(async (s) => {
      const { data: first } = await db
        .from("scans")
        .select("checklist:result->checklist")
        .eq("site_id", s.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const history = shapeHistory(bySite.get(s.id) ?? []);
      const checks = checklistProgress(s.last_checklist, (first as { checklist?: unknown } | null)?.checklist ?? null);
      const scoreNow = typeof s.last_score === "number" ? s.last_score : (history.at(-1)?.score ?? null);
      return {
        siteId: s.id,
        host: s.host,
        url: s.url,
        since: s.created_at,
        monitor: s.monitor,
        scoreNow,
        scoreFirst: history[0]?.score ?? scoreNow,
        history,
        checksPassing: checks.passing,
        checksTotal: checks.total,
        checksFixed: checks.fixed,
        aiMentionShare: typeof s.ai_last?.mentionShare === "number" ? s.ai_last.mentionShare : null,
      } satisfies SiteProgress;
    }),
  );
}

/** Merged fix pull requests plus guided fixes Olmene has seen live. */
export async function countFixesShipped(db: SupabaseClient, userId: string): Promise<number> {
  const [{ count: merged }, { data: guided }] = await Promise.all([
    db.from("agent_jobs").select("id", { count: "exact", head: true }).eq("user_id", userId).not("merged_at", "is", null),
    db.from("guided_runs").select("live_count").eq("user_id", userId).limit(200),
  ]);
  const live = ((guided ?? []) as { live_count: number | null }[]).reduce((n, g) => n + (g.live_count ?? 0), 0);
  return (merged ?? 0) + live;
}

// ── Public progress pages ──────────────────────────────────────────────────

export interface PublicShare {
  slug: string;
  /** Whose site it is (server side only: never sent to the page). */
  ownerId: string;
  owner: { name: string | null; avatarUrl: string | null };
  site: SiteProgress;
}

/** What /p/[slug]/ shows, or null when the link doesn't exist (or was turned off). */
export async function loadPublicShare(db: SupabaseClient, slug: string): Promise<PublicShare | null> {
  const { data: share } = await db.from("progress_shares").select("slug, user_id, site_id, show_name").eq("slug", slug).maybeSingle();
  if (!share) return null;
  const [sites, { data: profile }] = await Promise.all([
    loadSiteProgress(db, share.user_id as string, [share.site_id as string]),
    db.from("profiles").select("display_name, avatar_path").eq("id", share.user_id).maybeSingle(),
  ]);
  const site = sites[0];
  if (!site) return null;
  const p = profile as { display_name: string | null; avatar_path: string | null } | null;
  return {
    slug: share.slug as string,
    ownerId: share.user_id as string,
    owner: share.show_name ? { name: p?.display_name ?? null, avatarUrl: avatarUrl(p?.avatar_path) } : { name: null, avatarUrl: null },
    site,
  };
}

// ── Export ─────────────────────────────────────────────────────────────────

/** Everything Olmene keeps about the user, as one JSON document (secrets left out). */
export async function exportUserData(db: SupabaseClient, userId: string, email: string | null): Promise<Record<string, unknown>> {
  const own = <T>(table: string, columns: string, limit = 1000) =>
    db.from(table).select(columns).eq("user_id", userId).limit(limit).then(({ data }) => (data ?? []) as T[]);
  const [profile, subscriptions, analyses, reports, sites, scans, notifications, fixRuns, guided, alertChannels, connections, shares, clients, clientPages, reportRecipients] = await Promise.all([
    db.from("profiles").select("email, display_name, avatar_path, notify_email, digest_email, created_at").eq("id", userId).maybeSingle().then(({ data }) => data),
    own("subscriptions", "polar_product_id, status, current_period_start, current_period_end, cancel_at_period_end"),
    db.from("analysis_jobs").select("id, site_url, input, status, created_at, completed_at").eq("user_id", userId).is("deleted_at", null).limit(500).then(({ data }) => data ?? []),
    own("reports", "id, job_id, title, data, created_at", 200),
    own("sites", "url, host, monitor, last_score, last_scan_at, competitors, ai_prompts, ai_last, created_at"),
    own("scans", "site_url, result, created_at", 300),
    own("notifications", "kind, payload, status, created_at", 500),
    own("agent_jobs", "id, provider, status, pr_url, pr_state, merged_at, created_at, completed_at", 500),
    own("guided_runs", "site_url, platform_id, fixes, live_count, total_count, created_at", 200),
    own("alert_channels", "kind, label, kinds, active, created_at"),
    own("connections", "provider, provider_account_id, status, scopes, created_at"),
    own("progress_shares", "slug, show_name, views, created_at"),
    own("clients", "id, name, website, contact_email, report_cadence, report_sent_at, created_at"),
    own("client_portals", "client_id, slug, views, created_at"),
    own("client_recipients", "client_id, email, unsubscribed_at, created_at", 2000),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account: { id: userId, email, ...(profile ?? {}) },
    subscriptions,
    analyses,
    reports,
    sites,
    scans,
    notifications,
    fixRuns,
    guidedFixes: guided,
    alertChannels,
    connections,
    progressLinks: shares,
    clients,
    clientPages,
    clientReportRecipients: reportRecipients,
    note: "Payment receipts are kept by our payment provider, Polar. Webhook URLs, access tokens, signing secrets and unsubscribe links are not included.",
  };
}

// ── Deletion ───────────────────────────────────────────────────────────────

/** Work in progress that deletion would cut off, or null when it's safe to go ahead. */
export async function busyWith(db: SupabaseClient, userId: string): Promise<"analysis" | "fix" | null> {
  const [{ count: analyses }, { count: fixes }] = await Promise.all([
    db.from("analysis_jobs").select("id", { count: "exact", head: true }).eq("user_id", userId).in("status", ["queued", "running"]),
    db.from("agent_jobs").select("id", { count: "exact", head: true }).eq("user_id", userId).in("status", ["queued", "planning", "previewing", "applying", "verifying"]),
  ]);
  if ((analyses ?? 0) > 0) return "analysis";
  if ((fixes ?? 0) > 0) return "fix";
  return null;
}

/** A plan that will charge again (active and not set to cancel), or null. */
export async function renewingPlan(db: SupabaseClient, userId: string): Promise<{ renewsAt: string | null } | null> {
  const { data } = await db
    .from("subscriptions")
    .select("status, current_period_end, cancel_at_period_end")
    .eq("user_id", userId)
    .in("status", ["active", "trialing", "past_due"]);
  const now = Date.now();
  const live = ((data ?? []) as { current_period_end: string | null; cancel_at_period_end: boolean }[]).find(
    (s) => !s.cancel_at_period_end && (!s.current_period_end || Date.parse(s.current_period_end) > now),
  );
  return live ? { renewsAt: live.current_period_end } : null;
}

function shotPath(scan: { id: string; created_at: string; shot: unknown }): string | null {
  const url = (scan.shot as { url?: unknown } | null)?.url;
  if (typeof url === "string") {
    const i = url.indexOf(`/${SHOT_BUCKET}/`);
    if (i >= 0) return decodeURIComponent(url.slice(i + SHOT_BUCKET.length + 2).split("?")[0]);
  }
  return scan.shot ? `${scan.created_at.slice(0, 10)}/${scan.id}.jpg` : null;
}

async function removeObjects(db: SupabaseClient, bucket: string, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    await db.storage.from(bucket).remove(paths.slice(i, i + 100));
  }
}

/**
 * "Delete my data": reports and analyses, sites and their weekly history,
 * scans and screenshots, the activity feed, guided fixes, pull-request checks,
 * progress links, and clients with their pages. The account, plan, purchases, connections, alert
 * channels and the fix-run record (what Olmene changed in your code) stay.
 *
 * Analyses are emptied and hidden rather than removed: the month's report
 * count and report credits are worked out from those rows.
 */
export async function deleteUserData(db: SupabaseClient, userId: string): Promise<void> {
  const { data: siteRows } = await db.from("sites").select("id").eq("user_id", userId).limit(500);
  const siteIds = ((siteRows ?? []) as { id: string }[]).map((s) => s.id);

  // Scans: the user's own, and the weekly ones of their sites.
  const scanFilters = [`user_id.eq.${userId}`, ...(siteIds.length ? [`site_id.in.(${siteIds.join(",")})`] : [])];
  for (let round = 0; round < 20; round++) {
    const { data: scans } = await db.from("scans").select("id, created_at, shot").or(scanFilters.join(",")).limit(200);
    const list = (scans ?? []) as { id: string; created_at: string; shot: unknown }[];
    if (!list.length) break;
    await removeObjects(db, SHOT_BUCKET, list.map(shotPath).filter((p): p is string => !!p));
    const { error } = await db.from("scans").delete().in("id", list.map((s) => s.id));
    if (error) throw new Error(`scans: ${error.message}`);
    if (list.length < 200) break;
  }

  const steps: [string, PromiseLike<{ error: { message: string } | null }>][] = [
    ["progress_shares", db.from("progress_shares").delete().eq("user_id", userId)],
    ["sites", db.from("sites").delete().eq("user_id", userId)], // cascades AI checks and competitor snapshots
    ["reports", db.from("reports").delete().eq("user_id", userId)],
    ["notifications", db.from("notifications").delete().eq("user_id", userId)],
    ["guided_runs", db.from("guided_runs").delete().eq("user_id", userId)],
    ["pr_checks", db.from("pr_checks").delete().eq("user_id", userId)],
    ["client_portals", db.from("client_portals").delete().eq("user_id", userId)],
    ["client_recipients", db.from("client_recipients").delete().eq("user_id", userId)],
    ["clients", db.from("clients").delete().eq("user_id", userId)],
  ];
  for (const [name, step] of steps) {
    const { error } = await step;
    if (error) throw new Error(`${name}: ${error.message}`);
  }
  const { error } = await db
    .from("analysis_jobs")
    .update({ site_url: "deleted", input: {}, step_outputs: {}, step_log: [], error: null, wait_reason: null, deleted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw new Error(`analysis_jobs: ${error.message}`);
}

/**
 * Deletes the account. Data that doesn't cascade from auth.users goes first
 * (scans and screenshots, the profile picture), the usage ledger is
 * anonymised, then the auth user is removed and everything else cascades.
 */
export async function deleteAccount(db: SupabaseClient, userId: string): Promise<void> {
  await deleteUserData(db, userId);
  const { data: files } = await db.storage.from(AVATAR_BUCKET).list(userId, { limit: 100 });
  await removeObjects(db, AVATAR_BUCKET, ((files ?? []) as { name: string }[]).map((f) => `${userId}/${f.name}`));
  // The workspace's logo (brand-assets/<workspace id>/…) goes with it.
  const { data: ws } = await db.from("workspaces").select("id").eq("owner_id", userId).maybeSingle();
  if (ws) {
    const wsId = (ws as { id: string }).id;
    const { data: logos } = await db.storage.from("brand-assets").list(wsId, { limit: 100 });
    await removeObjects(db, "brand-assets", ((logos ?? []) as { name: string }[]).map((f) => `${wsId}/${f.name}`));
  }
  await db.from("engine_usage").update({ user_id: null }).eq("user_id", userId);
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw new Error(`auth: ${error.message}`);
}
