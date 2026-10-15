// notify — sends customer emails from the outbox (public.notifications).
// pg_cron calls it every minute with the cron secret. Producers (reports,
// fix runs, re-checks, monitoring) only insert rows; this function renders and
// sends them through Brevo, at most once each (dedupe_key), honoring the
// user's preferences. Without BREVO_API_KEY + NOTIFY_FROM_EMAIL it sends
// nothing, and rows older than 48 h are marked stale instead of sent late.
//
// GET/POST ?unsubscribe=<token>&list=digest|all — one-click opt-out.
// POST ?unsubscribe_client=<token> — one-click stop of a client report (RFC 8058); a GET
// is sent to olmene.com/unsubscribe/, which asks first (mail scanners open every link).
import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import { emailConfigured, sendEmail } from "../_shared/email.ts";
import type { Cadence } from "../_shared/client-report.ts";
import { type ClientReportView, loadClientReport } from "./client-report.ts";
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
/** Kinds that never go to alert channels (they carry a link meant for one person, or go to the agency's clients). */
const PRIVATE_KINDS = new Set(["workspace_invite", "client_report"]);
const INVITE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REPORT_TOKEN = /^[0-9a-f]{64}$/;

type Outcome = { status: "sent" } | { status: "skipped" | "failed"; error: string };

/**
 * One client report to one person: a recipient the agency added (with an
 * unsubscribe link), or a test to whoever asked for it. The report itself is
 * built once per client and period, however many people it goes to.
 */
async function sendClientReport(
  supabase: ReturnType<typeof db>,
  n: Row,
  appUrl: string,
  fnBase: string,
  built: Map<string, Promise<ClientReportView | null | undefined>>,
): Promise<Outcome> {
  const p = n.payload ?? {};
  const clientId = typeof p.clientId === "string" && UUID.test(p.clientId) ? p.clientId : null;
  if (!clientId) return { status: "skipped", error: "report without a client" };
  const cadence: Cadence = p.cadence === "monthly" ? "monthly" : "weekly";
  const test = p.test === true;
  let to: string;
  let unsubscribeUrl: string | null = null;
  let oneClickUrl: string | null = null;
  if (test) {
    to = typeof p.to === "string" ? p.to.trim().toLowerCase() : "";
    if (!INVITE_EMAIL.test(to)) return { status: "skipped", error: "test without a valid address" };
  } else {
    const rid = typeof p.recipientId === "string" && UUID.test(p.recipientId) ? p.recipientId : null;
    const { data: rec } = rid
      ? await supabase.from("client_recipients").select("email, unsub_token, unsubscribed_at, client_id").eq("id", rid).maybeSingle()
      : { data: null };
    if (!rec || rec.client_id !== clientId) return { status: "skipped", error: "recipient removed" };
    if (rec.unsubscribed_at) return { status: "skipped", error: "recipient unsubscribed" };
    to = rec.email as string;
    // The footer opens a page that asks first (mail scanners open every link);
    // the mail app's own button (List-Unsubscribe) POSTs here directly.
    unsubscribeUrl = `${appUrl.replace(/\/$/, "")}/unsubscribe/?t=${rec.unsub_token}`;
    oneClickUrl = `${fnBase}?unsubscribe_client=${rec.unsub_token}`;
  }
  const end = typeof p.periodEnd === "string" && !Number.isNaN(Date.parse(p.periodEnd)) ? new Date(p.periodEnd) : new Date(n.created_at);
  const key = `${clientId}:${cadence}:${end.toISOString()}`;
  if (!built.has(key)) {
    built.set(key, loadClientReport(supabase, { ownerId: n.user_id, clientId, cadence, end, appUrl, storageUrl: Deno.env.get("SUPABASE_URL") ?? "" }).catch(() => undefined));
  }
  const report = await built.get(key)!;
  if (report === undefined) return { status: "failed", error: "couldn't read the report" };
  const mail = report ? render("client_report", { ...report, test, unsubscribeUrl }, appUrl, "") : null;
  if (!report || !mail) return { status: "skipped", error: "nothing to report" };
  const res = await sendEmail({
    to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    tag: "client_report",
    unsubscribeUrl: oneClickUrl ?? undefined,
    fromName: report.fromName,
    replyTo: report.replyTo ?? undefined,
  });
  if (!res.ok) return { status: "failed", error: res.error ?? "send failed" };
  // "Last sent" on the Clients page means someone really got one.
  if (!test) await supabase.from("clients").update({ report_sent_at: new Date().toISOString() }).eq("id", clientId);
  return { status: "sent" };
}

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

  // ── One-click unsubscribe from a client report (List-Unsubscribe, RFC 8058) ──
  // Only the mail app's POST acts. A GET (a person, or a mail scanner opening
  // every link) goes to the page that asks first.
  const clientToken = url.searchParams.get("unsubscribe_client");
  if (clientToken) {
    if (!REPORT_TOKEN.test(clientToken)) return text("That unsubscribe link isn't valid.", 400);
    if (req.method !== "POST") {
      const app = (Deno.env.get("APP_URL") ?? "https://olmene.com").replace(/\/$/, "");
      return Response.redirect(`${app}/unsubscribe/?t=${clientToken}`, 303);
    }
    const { data: rec } = await supabase.from("client_recipients").select("id, client_id, unsubscribed_at").eq("unsub_token", clientToken).maybeSingle();
    // Unknown (the agency removed the client): nothing will be sent to it either.
    if (!rec) return text("Done: you won't get these reports any more.");
    if (!rec.unsubscribed_at) await supabase.from("client_recipients").update({ unsubscribed_at: new Date().toISOString() }).eq("id", rec.id);
    const { data: c } = await supabase.from("clients").select("name").eq("id", rec.client_id).maybeSingle();
    return text(`Done: you won't get website reports${c?.name ? ` for ${c.name}` : ""} any more.`);
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
      // Invitations carry a sign-up link meant for one person: never to channels.
      if (!PRIVATE_KINDS.has(n.kind)) channelOut.posted += await deliverToChannels(supabase, n, appUrl).catch(() => 0);
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
  const reports = new Map<string, Promise<ClientReportView | null | undefined>>();
  for (const n of (rows ?? []) as Row[]) {
    const mark = (patch: Record<string, unknown>) => supabase.from("notifications").update(patch).eq("id", n.id);
    if (Date.now() - new Date(n.created_at).getTime() > STALE_MS) {
      await mark({ status: "skipped", error: "stale (older than 48 h)" });
      out.skipped++;
      continue;
    }
    if (n.kind === "client_report") {
      const r = await sendClientReport(supabase, n, appUrl, fnBase, reports);
      if (r.status === "sent") {
        await mark({ status: "sent", sent_at: new Date().toISOString(), attempts: n.attempts + 1, error: null });
        out.sent++;
      } else if (r.status === "skipped") {
        await mark({ status: "skipped", error: r.error });
        out.skipped++;
      } else {
        const attempts = n.attempts + 1;
        await mark({ status: attempts >= MAX_ATTEMPTS ? "failed" : "pending", attempts, error: r.error });
        out.failed++;
      }
      continue;
    }
    // Who it goes to, and the footer that says why.
    let to: string;
    let footer: string;
    let textFooter: string;
    let unsubscribeUrl: string | undefined;
    if (n.kind === "workspace_invite") {
      // A workspace invitation goes to the address that was invited, who may
      // not have an account yet; it's a one-off, so no unsubscribe.
      const addr = typeof n.payload?.to === "string" ? n.payload.to.trim().toLowerCase() : "";
      if (!INVITE_EMAIL.test(addr)) {
        await mark({ status: "skipped", error: "invite without a valid address" });
        out.skipped++;
        continue;
      }
      to = addr;
      footer = "You get this because someone invited this address to a workspace on Olmene. If you weren't expecting it, you can ignore it.";
      textFooter = footer;
    } else {
      const { data: profile } = await supabase.from("profiles").select("email, notify_email, digest_email, unsubscribe_token").eq("id", n.user_id).maybeSingle();
      if (!profile?.email) {
        await mark({ status: "skipped", error: "no email on profile" });
        out.skipped++;
        continue;
      }
      const isDigest = n.kind === "weekly_digest" || n.kind === "competitor_change" || n.kind === "ai_visibility_change";
      if (!profile.notify_email || (isDigest && !profile.digest_email)) {
        await mark({ status: "skipped", error: "user opted out" });
        out.skipped++;
        continue;
      }
      const unsubAll = `${fnBase}?unsubscribe=${profile.unsubscribe_token}&list=all`;
      const unsubDigest = `${fnBase}?unsubscribe=${profile.unsubscribe_token}&list=digest`;
      to = profile.email;
      footer = `You get this because you use Olmene. <a href="${isDigest ? unsubDigest : unsubAll}">${isDigest ? "Stop weekly emails" : "Stop update emails"}</a>.`;
      textFooter = `${isDigest ? "Stop weekly emails" : "Stop update emails"}: ${isDigest ? unsubDigest : unsubAll}`;
      unsubscribeUrl = unsubDigest;
    }
    const mail = render(n.kind, n.payload, appUrl, footer);
    if (!mail) {
      await mark({ status: "skipped", error: `no template for ${n.kind}` });
      out.skipped++;
      continue;
    }
    const res = await sendEmail({
      to,
      subject: mail.subject,
      html: mail.html,
      text: `${mail.text}\n\n—\n${textFooter}`,
      tag: n.kind,
      unsubscribeUrl: mail.optional ? unsubscribeUrl : undefined,
    });
    if (res.ok) {
      // The invitation link has done its job: don't keep it in the database.
      const sentPayload = n.kind === "workspace_invite" ? { ...n.payload, link: null } : undefined;
      await mark({ status: "sent", sent_at: new Date().toISOString(), attempts: n.attempts + 1, error: null, ...(sentPayload ? { payload: sentPayload } : {}) });
      out.sent++;
    } else {
      const attempts = n.attempts + 1;
      await mark({ status: attempts >= MAX_ATTEMPTS ? "failed" : "pending", attempts, error: res.error ?? "send failed" });
      out.failed++;
    }
  }
  return Response.json({ ok: true, ...out, ...channelOut });
});
