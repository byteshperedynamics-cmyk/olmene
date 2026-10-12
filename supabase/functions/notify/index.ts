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
  if (!emailConfigured()) return Response.json({ ok: true, skipped: "BREVO_API_KEY / NOTIFY_FROM_EMAIL not set" });

  const appUrl = Deno.env.get("APP_URL") ?? "https://olmene.com";
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
  return Response.json({ ok: true, ...out });
});
