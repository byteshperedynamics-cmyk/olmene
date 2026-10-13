// health-watch — uptime and error watch (pg_cron every 5 minutes).
//  1. Probes the Worker's API routes: on 2026-10-12 every /api route crashed
//     at startup while the pages kept loading, and nobody noticed for a day.
//  2. Collects new ops_events errors (failed reports and fix runs, crashed
//     crons, failed probes).
//  3. Emails the operator (ALERT_EMAIL, via Brevo) at most every 30 minutes
//     while something is wrong. Without email configured it only records.
import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import { emailConfigured, escapeHtml, layout, sendEmail } from "../_shared/email.ts";
import { recordOps } from "../_shared/ledger.ts";
import { deployVersion, listDeployments, rollbackTarget } from "./rollback.ts";

const ALERT_EVERY_MS = 30 * 60_000;

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

export interface Probe {
  path: string;
  ok: (status: number) => boolean;
  want: string;
}

export const PROBES: Probe[] = [
  { path: "/", ok: (s) => s === 200, want: "200" },
  { path: "/api/public/stats/", ok: (s) => s === 200, want: "200" },
  // Signed out: 401, or 503 when the agent is off. A 5xx means the Worker is broken.
  { path: "/api/agent/config/", ok: (s) => s === 401 || s === 503, want: "401/503" },
  { path: "/api/auth/google/", ok: (s) => s < 500, want: "<500" },
];

async function probe(base: string, p: Probe): Promise<{ path: string; status: number; ok: boolean; want: string }> {
  try {
    const res = await fetch(base + p.path, { redirect: "manual", headers: { "User-Agent": "olmene-health-watch/1.0" }, signal: AbortSignal.timeout(10_000) });
    await res.body?.cancel().catch(() => {});
    return { path: p.path, status: res.status, ok: p.ok(res.status), want: p.want };
  } catch {
    return { path: p.path, status: 0, ok: false, want: p.want };
  }
}

type Db = ReturnType<typeof db>;

/** Two failing runs in a row on the API routes + a fresh deploy → previous version (opt-in). */
async function maybeRollback(supabase: Db, failingApi: number): Promise<string | null> {
  if (Deno.env.get("AUTO_ROLLBACK") !== "1" || !failingApi) return null;
  const account = Deno.env.get("CF_ACCOUNT_ID");
  const token = Deno.env.get("CF_DEPLOY_TOKEN");
  const script = Deno.env.get("CF_WORKER_NAME") ?? "olmene";
  if (!account || !token) return null;
  const since = new Date(Date.now() - 11 * 60_000).toISOString();
  const { count } = await supabase.from("ops_events").select("id", { count: "exact", head: true }).eq("source", "health-watch").gte("created_at", since);
  if ((count ?? 0) < 2) return null; // this run + the previous one
  const { count: recent } = await supabase.from("ops_events").select("id", { count: "exact", head: true }).eq("source", "rollback").gte("created_at", new Date(Date.now() - 3 * 3_600_000).toISOString());
  if ((recent ?? 0) > 0) return null;
  try {
    const target = rollbackTarget(await listDeployments(account, script, token), new Date());
    if (!target.versionId) {
      await recordOps(supabase, "rollback", `no automatic rollback: ${target.reason}`, {}, "warn");
      return null;
    }
    await deployVersion(account, script, token, target.versionId, "health-watch automatic rollback: API routes failing");
    await recordOps(supabase, "rollback", `rolled back ${script} to ${target.versionId}`, { reason: target.reason });
    return target.versionId;
  } catch (e) {
    await recordOps(supabase, "rollback", "automatic rollback failed", { error: String(e).slice(0, 200) });
    return null;
  }
}

/** Hourly: jobs stuck in the pipeline, AI calls failing; daily: a real scan of our own site, old screenshots. */
async function canary(supabase: Db, base: string, now: Date): Promise<string[]> {
  const problems: string[] = [];
  if (now.getUTCMinutes() >= 5) return problems;
  const hours = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
  const [{ count: stuckReports }, { count: stuckFixes }, { data: llm }] = await Promise.all([
    // Reports take minutes; one still open 2 hours after it started (and not waiting on a budget) is stuck.
    supabase.from("analysis_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "running"]).is("wait_reason", null).lt("created_at", hours(2)).gt("created_at", hours(48)),
    supabase.from("agent_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "planning", "previewing", "applying"]).lt("updated_at", hours(6)),
    supabase.from("engine_usage").select("ok").eq("kind", "llm").gte("created_at", hours(1)).limit(500),
  ]);
  if ((stuckReports ?? 0) > 0) problems.push(`${stuckReports} report(s) started over 2 hours ago and haven't finished`);
  if ((stuckFixes ?? 0) > 0) problems.push(`${stuckFixes} fix run(s) haven't moved for 6 hours`);
  const calls = llm ?? [];
  const failed = calls.filter((c: { ok: boolean }) => !c.ok).length;
  if (calls.length >= 10 && failed / calls.length > 0.3) problems.push(`${failed} of ${calls.length} AI calls failed in the last hour`);
  if (now.getUTCHours() === 6) {
    // A real free scan of our own homepage, through the public function.
    try {
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/free-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "" },
        body: JSON.stringify({ url: base }),
        signal: AbortSignal.timeout(60_000),
      });
      const body = await res.json().catch(() => null) as { checklist?: unknown[] } | null;
      if (!res.ok || (body?.checklist?.length ?? 0) < 21) problems.push(`daily self-scan of ${base} failed (HTTP ${res.status})`);
    } catch (e) {
      problems.push(`daily self-scan of ${base} failed (${String(e).slice(0, 80)})`);
    }
    await pruneShots(supabase, now).catch(() => {});
  }
  for (const p of problems) await recordOps(supabase, "canary", p);
  return problems;
}

/** Screenshots live in date folders (scan-shots/YYYY-MM-DD/…); anonymous scans expire after 30 days. */
async function pruneShots(supabase: Db, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - 31 * 86_400_000).toISOString().slice(0, 10);
  const { data: folders } = await supabase.storage.from("scan-shots").list("", { limit: 100 });
  for (const f of folders ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.name) || f.name >= cutoff) continue;
    const { data: files } = await supabase.storage.from("scan-shots").list(f.name, { limit: 1000 });
    const paths = (files ?? []).map((x) => `${f.name}/${x.name}`);
    if (paths.length) await supabase.storage.from("scan-shots").remove(paths);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only.", { status: 405 });
  if (!cronAuthorized(req)) return new Response("Bad cron secret.", { status: 401 });
  const supabase = db();
  const base = (Deno.env.get("APP_URL") ?? "https://olmene.com").replace(/\/$/, "");

  const results = await Promise.all(PROBES.map((p) => probe(base, p)));
  const failing = results.filter((r) => !r.ok);
  if (failing.length) {
    await recordOps(supabase, "health-watch", `${failing.length} probe(s) failing on ${base}`, { failing });
  }
  const rolledBackTo = await maybeRollback(supabase, failing.filter((f) => f.path.startsWith("/api/")).length);
  const canaryProblems = await canary(supabase, base, new Date()).catch(() => [] as string[]);

  // Errors since the last alert (or the last 30 minutes).
  const { data: lastAlert } = await supabase.from("ops_events").select("created_at").eq("source", "alert").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const lastAlertAt = lastAlert ? new Date(lastAlert.created_at).getTime() : 0;
  const since = new Date(Math.max(lastAlertAt, Date.now() - ALERT_EVERY_MS)).toISOString();
  const { data: errors } = await supabase.from("ops_events").select("source, message, created_at").eq("severity", "error").gt("created_at", since).neq("source", "alert").order("created_at", { ascending: false }).limit(30);

  const due = Date.now() - lastAlertAt >= ALERT_EVERY_MS;
  const to = Deno.env.get("ALERT_EMAIL");
  let alerted = false;
  if ((failing.length || errors?.length) && due && to && emailConfigured()) {
    const lines = [
      ...(rolledBackTo ? [`Automatic rollback: the Worker is back on version ${rolledBackTo}.`] : []),
      ...failing.map((f) => `${f.path} answered ${f.status || "nothing"} (want ${f.want})`),
      ...(errors ?? []).map((e) => `${e.created_at.slice(11, 16)} UTC · ${e.source}: ${e.message}`),
    ];
    const subject = failing.length ? `Olmene: ${failing.length} health check(s) failing` : `Olmene: ${errors!.length} new error(s)`;
    const res = await sendEmail({
      to,
      subject,
      text: `${lines.join("\n")}\n\nIf the API routes fail: npx wrangler tail olmene (cause), npx wrangler deployments list + npx wrangler rollback <version> (fix).`,
      html: layout({
        heading: subject,
        paragraphs: [lines.map((l) => escapeHtml(l)).join("<br>"), "If the API routes fail: <code>npx wrangler tail olmene</code> shows the cause; <code>npx wrangler deployments list</code> and <code>npx wrangler rollback &lt;version&gt;</code> restore the last good version."],
        footer: "Sent by health-watch at most every 30 minutes while something is wrong.",
      }),
      tag: "ops-alert",
    });
    alerted = res.ok;
    if (res.ok) await recordOps(supabase, "alert", subject, { lines: lines.length }, "info");
  }
  return Response.json({ ok: failing.length === 0, probes: results, newErrors: errors?.length ?? 0, alerted, rolledBackTo, canary: canaryProblems });
});
