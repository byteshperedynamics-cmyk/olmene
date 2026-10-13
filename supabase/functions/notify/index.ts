// notify — sends customer emails from the outbox (public.notifications).
// pg_cron calls it every minute with the cron secret. Producers (reports,
// fix runs, re-checks, monitoring) only insert rows; this function renders and
// sends them through Brevo, at most once each (dedupe_key), honoring the
// user's preferences. Without BREVO_API_KEY + NOTIFY_FROM_EMAIL it sends
// nothing, and rows older than 48 h are marked stale instead of sent late.
//
// GET/POST ?unsubscribe=<token>&list=digest|all — one-click opt-out.
import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import { emailConfigured, sendEmail } from "../_shared/email.ts";
import { render } from "./templates.ts";
import { type AlertChannel, allowedHookUrl, discordBody, MAX_FAILURES, signBody, slackBody, wants, webhookBody } from "./channels.ts";
import { privateIp } from "../monitor/logic.ts";

const STALE_MS = 48 * 3600_000;
const BATCH = 40;
const MAX_ATTEMPTS = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

const text = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

interface Row {
  id: number;
  user_id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  created_at: string;
  channels_done_at?: string | null;
}

/** Kinds that exist only for alert channels (no email). */
const CHANNEL_ONLY = new Set(["channel_test"]);

/** Post one event to the user's Slack / Discord / webhook channels (one attempt each). */
async function deliverToChannels(supabase: ReturnType<typeof db>, n: Row, appUrl: string): Promise<number> {
  const { data } = await supabase.from("alert_channels").select("id, user_id, kind, url, secret, kinds, failures").eq("user_id", n.user_id).eq("active", true).limit(10);
  const channels = ((data ?? []) as AlertChannel[]).filter((c) => wants(c, n.kind) || n.kind === "channel_test");
  if (!channels.length) return 0;
  const msg = n.kind === "channel_test"
    ? { subject: "Olmene alerts are connected", text: `This channel will get Olmene updates: reports ready, pull requests, fixes going live, regressions and competitor changes.\n\n${appUrl}/app/` }
    : render(n.kind, n.payload, appUrl, "");
  if (!msg) return 0;
  let delivered = 0;
  for (const c of channels) {
    if (!allowedHookUrl(c.kind, c.url)) continue;
    try {
      if (c.kind === "webhook") {
        const ips = await Deno.resolveDns(new URL(c.url).hostname, "A").catch(() => [] as string[]);
        if (!ips.length || ips.some(privateIp)) throw new Error("webhook host is not public");
      }
      const body = JSON.stringify(c.kind === "slack" ? slackBody(msg.subject, msg.text) : c.kind === "discord" ? discordBody(msg.subject, msg.text) : webhookBody(n.kind, n.payload, msg.subject));
      const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": "Olmene-Alerts/1.0" };
      if (c.kind === "webhook" && c.secret) headers["X-Olmene-Signature"] = await signBody(c.secret, body);
      const res = await fetch(c.url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(8_000) });
      await res.body?.cancel().catch(() => {});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await supabase.from("alert_channels").update({ failures: 0, last_error: null, last_sent_at: new Date().toISOString() }).eq("id", c.id);
      delivered++;
    } catch (e) {
      const failures = (c.failures ?? 0) + 1;
      await supabase.from("alert_channels").update({ failures, last_error: String((e as Error).message ?? e).slice(0, 200), ...(failures >= MAX_FAILURES ? { active: false } : {}) }).eq("id", c.id);
    }
  }
  return delivered;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const supabase = db();

  // ── One-click unsubscribe (token from the email footer) ──
  const token = url.searchParams.get("unsubscribe");
  if (token) {
    if (!UUID.test(token)) return text("That unsubscribe link isn't valid.", 400);
    const list = url.searchParams.get("list") === "digest" ? "digest" : "all";
    const patch = list === "digest" ? { digest_email: false } : { notify_email: false, digest_email: false };
    const { data } = await supabase.from("profiles").update(patch).eq("unsubscribe_token", token).select("id");
    if (!data?.length) return text("That unsubscribe link isn't valid any more.", 404);
    return text(list === "digest" ? "Done: no more weekly summaries from Olmene." : "Done: Olmene won't email you updates any more. Sign-in links still arrive when you ask for one.");
  }

  if (req.method !== "POST") return text("POST only.", 405);
  if (!cronAuthorized(req)) return text("Bad cron secret.", 401);
  const appUrl = Deno.env.get("APP_URL") ?? "https://olmene.com";

  // Alert channels first (Slack, Discord, webhooks): independent of email.
  const channelOut = { posted: 0 };
  {
    const { data: pending } = await supabase
      .from("notifications")
      .select("id, user_id, kind, payload, attempts, created_at, channels_done_at")
      .is("channels_done_at", null)
      .gte("created_at", new Date(Date.now() - STALE_MS).toISOString())
      .order("created_at", { ascending: true })
      .limit(BATCH);
    for (const n of (pending ?? []) as Row[]) {
      channelOut.posted += await deliverToChannels(supabase, n, appUrl).catch(() => 0);
      await supabase.from("notifications").update({ channels_done_at: new Date().toISOString(), ...(CHANNEL_ONLY.has(n.kind) ? { status: "sent", sent_at: new Date().toISOString() } : {}) }).eq("id", n.id);
    }
  }
  if (!emailConfigured()) return Response.json({ ok: true, ...channelOut, skipped: "BREVO_API_KEY / NOTIFY_FROM_EMAIL not set" });

  const fnBase = `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/notify`;
  const { data: rows } = await supabase
    .from("notifications")
    .select("id, user_id, kind, payload, attempts, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH);

  const out = { sent: 0, skipped: 0, failed: 0 };
  for (const n of (rows ?? []) as Row[]) {
    const mark = (patch: Record<string, unknown>) => supabase.from("notifications").update(patch).eq("id", n.id);
    if (Date.now() - new Date(n.created_at).getTime() > STALE_MS) {
      await mark({ status: "skipped", error: "stale (older than 48 h)" });
      out.skipped++;
      continue;
    }
    const { data: profile } = await supabase.from("profiles").select("email, notify_email, digest_email, unsubscribe_token").eq("id", n.user_id).maybeSingle();
    if (!profile?.email) {
      await mark({ status: "skipped", error: "no email on profile" });
      out.skipped++;
      continue;
    }
    const isDigest = n.kind === "weekly_digest" || n.kind === "competitor_change";
    if (!profile.notify_email || (isDigest && !profile.digest_email)) {
      await mark({ status: "skipped", error: "user opted out" });
      out.skipped++;
      continue;
    }
    const unsubAll = `${fnBase}?unsubscribe=${profile.unsubscribe_token}&list=all`;
    const unsubDigest = `${fnBase}?unsubscribe=${profile.unsubscribe_token}&list=digest`;
    const footer = `You get this because you use Olmene. <a href="${isDigest ? unsubDigest : unsubAll}">${isDigest ? "Stop weekly emails" : "Stop update emails"}</a>.`;
    const mail = render(n.kind, n.payload, appUrl, footer);
    if (!mail) {
      await mark({ status: "skipped", error: `no template for ${n.kind}` });
      out.skipped++;
      continue;
    }
    const res = await sendEmail({
      to: profile.email,
      subject: mail.subject,
      html: mail.html,
      text: `${mail.text}\n\n—\n${isDigest ? "Stop weekly emails" : "Stop update emails"}: ${isDigest ? unsubDigest : unsubAll}`,
      tag: n.kind,
      unsubscribeUrl: mail.optional ? unsubDigest : undefined,
    });
    if (res.ok) {
      await mark({ status: "sent", sent_at: new Date().toISOString(), attempts: n.attempts + 1, error: null });
      out.sent++;
    } else {
      const attempts = n.attempts + 1;
      await mark({ status: attempts >= MAX_ATTEMPTS ? "failed" : "pending", attempts, error: res.error ?? "send failed" });
      out.failed++;
    }
  }
  return Response.json({ ok: true, ...out, ...channelOut });
});
