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
  return Response.json({ ok: failing.length === 0, probes: results, newErrors: errors?.length ?? 0, alerted });
});
