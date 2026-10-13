// monitor — weekly watch of every subscriber's site (pg_cron every 10 min,
// small batches). For each due site: re-scan it through free-audit (cron
// mode: no per-IP limit, saved as a monitor scan), compare with last week,
// alert on checks that got worse, snapshot up to 3 competitor homepages and
// alert on headline/price changes. Then queue one weekly digest per user.
// Sites come from completed reports (advance-analysis upserts them).
import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import { enqueueNotification, recordOps } from "../_shared/ledger.ts";
import { type Check, competitorChanges, type CompetitorSnapshot, isoWeek, privateIp, publicUrl, regressions, snapshotOf } from "./logic.ts";
import { groundedAnswer, smallJsonCall } from "../_shared/llm.ts";
import { analyzeAnswer, type Competitor, questionPrompt, type SiteProfile, summarize, validateQuestions, type VisibilityRun, visibilityChange } from "./visibility.ts";

const SITES_PER_RUN = 4;
const DIGEST_USERS_PER_RUN = 25;
const WEEK_MS = 7 * 86_400_000;
const USER_AGENT = "Mozilla/5.0 (compatible; OlmeneBot/1.0; +https://olmene.com)";

const db = () =>
  createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

function cronAuthorized(req: Request): boolean {
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  const given = req.headers.get("x-cron-secret") ?? "";
  if (secret.length < 16 || given.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= secret.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

/** Paying customers only (Fix/Team): active or trialing, period not over. */
async function subscribed(supabase: ReturnType<typeof db>, userId: string): Promise<boolean> {
  const { data } = await supabase.from("subscriptions").select("status, current_period_end").eq("user_id", userId).in("status", ["active", "trialing"]).limit(5);
  const now = Date.now();
  return (data ?? []).some((s) => !s.current_period_end || new Date(s.current_period_end).getTime() > now);
}

/** SSRF-safe GET of a public page: validated host, DNS checked, manual redirects (max 3), 8 s, 1 MB. */
async function fetchPublicPage(raw: string): Promise<string | null> {
  let url = publicUrl(raw);
  for (let hop = 0; url && hop <= 3; hop++) {
    try {
      const ips = await Deno.resolveDns(url.hostname, "A").catch(() => [] as string[]);
      if (!ips.length || ips.some(privateIp)) return null;
      const res = await fetch(url.toString(), { redirect: "manual", headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, signal: AbortSignal.timeout(8_000) });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        await res.body?.cancel().catch(() => {});
        url = loc ? publicUrl(new URL(loc, url).toString()) : null;
        continue;
      }
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) {
        await res.body?.cancel().catch(() => {});
        return null;
      }
      const buf = new Uint8Array(await res.arrayBuffer()).slice(0, 1_000_000);
      return new TextDecoder().decode(buf);
    } catch {
      return null;
    }
  }
  return null;
}

interface Site {
  id: string;
  user_id: string;
  url: string;
  host: string;
  last_checklist: Check[] | null;
  last_score: number | null;
  competitors: Array<{ name: string; url: string }> | null;
}

async function watchCompetitors(supabase: ReturnType<typeof db>, site: Site): Promise<number> {
  let alerts = 0;
  for (const c of (site.competitors ?? []).slice(0, 3)) {
    const html = await fetchPublicPage(c.url);
    if (!html) continue;
    const snap = await snapshotOf(html);
    const { data: prevRow } = await supabase.from("competitor_snapshots").select("title, h1, price_points, text_hash")
      .eq("site_id", site.id).eq("competitor_url", c.url).order("captured_at", { ascending: false }).limit(1).maybeSingle();
    const prev: CompetitorSnapshot | null = prevRow ? { title: prevRow.title, h1: prevRow.h1, pricePoints: prevRow.price_points ?? [], textHash: prevRow.text_hash ?? "" } : null;
    if (prev && prev.textHash === snap.textHash) continue; // identical page: no new snapshot
    await supabase.from("competitor_snapshots").insert({ site_id: site.id, competitor_url: c.url, title: snap.title, h1: snap.h1, price_points: snap.pricePoints, text_hash: snap.textHash });
    const changes = competitorChanges(prev, snap);
    if (changes.length) {
      alerts++;
      await enqueueNotification(supabase, {
        userId: site.user_id,
        kind: "competitor_change",
        payload: { site: site.host, competitor: c.name, url: c.url, changes },
        dedupeKey: `competitor_change:${site.id}:${c.url}:${snap.textHash}`,
      });
    }
  }
  return alerts;
}

async function scanSite(supabase: ReturnType<typeof db>, site: Site): Promise<{ regressions: number; competitorAlerts: number } | null> {
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/free-audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "" },
    body: JSON.stringify({ url: site.url, siteId: site.id, userId: site.user_id }),
    signal: AbortSignal.timeout(60_000),
  });
  const result = await res.json().catch(() => null) as { scanId?: string; checklist?: Check[]; scores?: { overall?: number } } | null;
  const next = new Date(Date.now() + WEEK_MS).toISOString();
  if (!res.ok || !result?.checklist) {
    // Site down or blocking us: try again tomorrow, and keep a trace.
    await supabase.from("sites").update({ next_scan_at: new Date(Date.now() + 86_400_000).toISOString(), updated_at: new Date().toISOString() }).eq("id", site.id);
    await recordOps(supabase, "monitor", `weekly scan failed for ${site.host}`, { siteId: site.id, status: res.status }, "warn");
    return null;
  }
  const worse = regressions(site.last_checklist, result.checklist);
  const score = result.scores?.overall ?? null;
  await supabase.from("sites").update({
    last_scan_id: result.scanId ?? null,
    last_scan_at: new Date().toISOString(),
    last_score: score,
    last_checklist: result.checklist,
    next_scan_at: next,
    updated_at: new Date().toISOString(),
  }).eq("id", site.id);
  if (worse.length) {
    await enqueueNotification(supabase, {
      userId: site.user_id,
      kind: "site_regression",
      payload: { siteId: site.id, site: site.host, regressed: worse, score, previousScore: site.last_score },
      dedupeKey: `site_regression:${site.id}:${result.scanId ?? Date.now()}`,
    });
  }
  const competitorAlerts = await watchCompetitors(supabase, site).catch(() => 0);
  return { regressions: worse.length, competitorAlerts };
}

// ─── AI search visibility (opt-in: AI_VISIBILITY=1) ──────────────────────
const AI_SITES_PER_RUN = 2;

interface AiSite {
  id: string;
  user_id: string;
  host: string;
  url: string;
  competitors: Competitor[] | null;
  profile: (Partial<SiteProfile> & { name?: string }) | null;
  ai_prompts: string[] | null;
  ai_last: VisibilityRun | null;
}

async function watchAiVisibility(supabase: ReturnType<typeof db>): Promise<{ checked: number; alerts: number }> {
  const out = { checked: 0, alerts: 0 };
  if (Deno.env.get("AI_VISIBILITY") !== "1") return out;
  const count = Math.max(3, Math.min(10, Number(Deno.env.get("AI_VISIBILITY_PROMPTS") ?? 6)));
  const { data: due } = await supabase.from("sites").select("id, user_id, host, url, competitors, profile, ai_prompts, ai_last")
    .eq("monitor", true).lte("ai_next_check_at", new Date().toISOString()).order("ai_next_check_at", { ascending: true }).limit(AI_SITES_PER_RUN * 3);
  for (const site of (due ?? []) as AiSite[]) {
    if (out.checked >= AI_SITES_PER_RUN) break;
    const later = (ms: number) => supabase.from("sites").update({ ai_next_check_at: new Date(Date.now() + ms).toISOString() }).eq("id", site.id);
    if (!(await subscribed(supabase, site.user_id)) || !site.profile?.name) {
      await later(WEEK_MS);
      continue;
    }
    const profile: SiteProfile = { name: site.profile.name, host: site.host, category: site.profile.category ?? null, oneLiner: site.profile.oneLiner ?? null, targetCustomers: site.profile.targetCustomers ?? [], location: site.profile.location ?? null, language: site.profile.language ?? null };
    let prompts = site.ai_prompts?.length ? site.ai_prompts : null;
    if (!prompts) {
      const { system, user } = questionPrompt(profile, count);
      const gen = await smallJsonCall<string[]>(supabase, { step: "ai-visibility-questions", source: "monitor", system, user, maxTokens: 500, temperature: 0.4, userId: site.user_id, validate: (v) => validateQuestions(v, profile, count) });
      prompts = gen?.data ?? null;
    }
    if (!prompts?.length) {
      await later(86_400_000);
      continue;
    }
    const competitors = (site.competitors ?? []).slice(0, 5);
    const answers = await Promise.all(prompts.map((q) => groundedAnswer(supabase, q, { userId: site.user_id }).then((a) => (a ? analyzeAnswer(q, a, profile, competitors) : null))));
    const results = answers.filter((a): a is NonNullable<typeof a> => !!a);
    out.checked++;
    if (results.length < Math.ceil(prompts.length / 2)) {
      await recordOps(supabase, "monitor", `AI visibility: only ${results.length}/${prompts.length} answers for ${site.host}`, { siteId: site.id }, "warn");
      await supabase.from("sites").update({ ai_prompts: prompts, ai_next_check_at: new Date(Date.now() + 86_400_000).toISOString() }).eq("id", site.id);
      continue;
    }
    const run = summarize(results);
    await supabase.from("ai_visibility_runs").insert({
      site_id: site.id, user_id: site.user_id, engine: "gemini-search", mention_share: run.mentionShare, cite_share: run.citeShare,
      competitor_mentions: run.competitorMentions, results: run.results,
    }).then(() => {}, () => {});
    const change = visibilityChange(site.ai_last, run, profile.name);
    if (change.changed) {
      out.alerts++;
      await enqueueNotification(supabase, {
        userId: site.user_id,
        kind: "ai_visibility_change",
        payload: { siteId: site.id, site: site.host, summary: change.summary, mentionShare: run.mentionShare, previousShare: site.ai_last?.mentionShare ?? null, questions: results.length },
        dedupeKey: `ai_visibility_change:${site.id}:${isoWeek(new Date())}`,
      });
    }
    await supabase.from("sites").update({
      ai_prompts: prompts,
      ai_last: { mentionShare: run.mentionShare, citeShare: run.citeShare, competitorMentions: run.competitorMentions, results: run.results.map((r) => ({ question: r.question, mentioned: r.mentioned, cited: r.cited })), checkedAt: new Date().toISOString() },
      ai_next_check_at: new Date(Date.now() + WEEK_MS).toISOString(),
    }).eq("id", site.id);
  }
  return out;
}

/** One digest per user per ISO week, once their sites have a scan from the last 7 days. */
async function queueDigests(supabase: ReturnType<typeof db>): Promise<number> {
  const week = isoWeek(new Date());
  const since = new Date(Date.now() - WEEK_MS).toISOString();
  const { data: recent } = await supabase.from("sites").select("user_id").eq("monitor", true).gte("last_scan_at", since).limit(500);
  const users = [...new Set((recent ?? []).map((r) => r.user_id as string))];
  if (!users.length) return 0;
  const keys = users.map((u) => `weekly_digest:${u}:${week}`);
  const { data: done } = await supabase.from("notifications").select("dedupe_key").in("dedupe_key", keys);
  const doneSet = new Set((done ?? []).map((d) => d.dedupe_key as string));
  let queued = 0;
  for (const userId of users.filter((u) => !doneSet.has(`weekly_digest:${u}:${week}`)).slice(0, DIGEST_USERS_PER_RUN)) {
    const { data: sites } = await supabase.from("sites").select("id, host, last_score, last_checklist").eq("user_id", userId).eq("monitor", true);
    const rows = [];
    for (const s of sites ?? []) {
      const { data: scans } = await supabase.from("scans").select("result").eq("site_id", s.id).order("created_at", { ascending: false }).limit(2);
      const prevScore = (scans?.[1]?.result as { scores?: { overall?: number } } | undefined)?.scores?.overall ?? null;
      const checklist = (s.last_checklist ?? []) as Check[];
      const prevChecklist = (scans?.[1]?.result as { checklist?: Check[] } | undefined)?.checklist ?? null;
      rows.push({
        host: s.host,
        score: s.last_score,
        delta: typeof s.last_score === "number" && typeof prevScore === "number" ? s.last_score - prevScore : null,
        failing: checklist.filter((c) => c.status !== "pass").length,
        regressions: regressions(prevChecklist, checklist).length,
      });
    }
    const [{ count: awaiting }, { count: openPrs }] = await Promise.all([
      supabase.from("agent_jobs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "awaiting_approval"),
      supabase.from("agent_jobs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("pr_state", "open"),
    ]);
    await enqueueNotification(supabase, {
      userId,
      kind: "weekly_digest",
      payload: { week, sites: rows, awaitingApproval: awaiting ?? 0, openPrs: openPrs ?? 0 },
      dedupeKey: `weekly_digest:${userId}:${week}`,
    });
    queued++;
  }
  return queued;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only.", { status: 405 });
  if (!cronAuthorized(req)) return new Response("Bad cron secret.", { status: 401 });
  const supabase = db();
  const { data: due } = await supabase
    .from("sites")
    .select("id, user_id, url, host, last_checklist, last_score, competitors")
    .eq("monitor", true)
    .lte("next_scan_at", new Date().toISOString())
    .order("next_scan_at", { ascending: true })
    .limit(SITES_PER_RUN * 3);

  const out = { scanned: 0, skippedUnpaid: 0, failed: 0, regressions: 0, competitorAlerts: 0, digests: 0 };
  for (const site of (due ?? []) as Site[]) {
    if (out.scanned >= SITES_PER_RUN) break;
    if (!(await subscribed(supabase, site.user_id))) {
      // Monitoring is part of the paid plans: look again in a week.
      await supabase.from("sites").update({ next_scan_at: new Date(Date.now() + WEEK_MS).toISOString() }).eq("id", site.id);
      out.skippedUnpaid++;
      continue;
    }
    const r = await scanSite(supabase, site).catch(async (e) => {
      await recordOps(supabase, "monitor", "site watch crashed", { siteId: site.id, error: String(e).slice(0, 200) });
      return null;
    });
    out.scanned++;
    if (!r) out.failed++;
    else {
      out.regressions += r.regressions;
      out.competitorAlerts += r.competitorAlerts;
    }
  }
  const ai = await watchAiVisibility(supabase).catch(async (e) => {
    await recordOps(supabase, "monitor", "AI visibility watch crashed", { error: String(e).slice(0, 200) });
    return { checked: 0, alerts: 0 };
  });
  out.digests = await queueDigests(supabase).catch(() => 0);
  return Response.json({ ok: true, ...out, aiVisibility: ai });
});
