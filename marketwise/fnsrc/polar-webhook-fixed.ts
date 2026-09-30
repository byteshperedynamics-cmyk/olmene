/**
 * polar-webhook — POST from Polar (api.polar.sh, Standard Webhooks signature).
 *
 * Fixes applied 2026-09-25:
 *  - Signature verification supports BOTH key derivations:
 *      * Standard Webhooks (secrets generated on/after 2026-09-08):
 *        key = base64-decoded bytes of the part after the `whsec_` prefix.
 *      * Legacy Polar HMAC (older secrets): key = UTF-8 bytes of the full
 *        `whsec_…` string.
 *    Both sign `${webhook-timestamp}.${rawBody}` with HMAC-SHA256 → base64,
 *    delivered as `v1,<sig>` (space-separated list) in `webhook-signature`.
 *  - User linking no longer relies on customer.external_id alone:
 *      external_id → customer.metadata.user_id → email lookup (profiles).
 *  - Handles the full subscription lifecycle, including `subscription.cycled`
 *    (period rollover → quota window reset), past_due, paused, resumed.
 *  - Dedup marker (webhook_events) is written AFTER a successful upsert so a
 *    failed upsert is retried by Polar instead of being marked processed.
 */
import { createClient } from "npm:@supabase/supabase-js@2.117.1";

// ── env / clients ─────────────────────────────────────────────────────
function getEnv() {
  return {
    SUPABASE_URL: Deno.env.get("SUPABASE_URL") ?? "",
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    POLAR_WEBHOOK_SECRET: Deno.env.get("POLAR_WEBHOOK_SECRET") ?? "",
  };
}

function serviceClient() {
  const env = getEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Constant-time string compare. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── signature verification (Standard Webhooks + legacy Polar HMAC) ────
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacSha256Base64(
  keyBytes: Uint8Array,
  payload: string,
): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

interface SignatureInput {
  webhookId: string | null;
  webhookTimestamp: string | null;
  webhookSignature: string | null;
  rawBody: string;
  secret: string;
  now?: number;
}

export async function verifyWebhookSignature(
  input: SignatureInput,
): Promise<boolean> {
  const { webhookId, webhookTimestamp, webhookSignature, rawBody, secret } =
    input;
  if (!webhookId || !webhookTimestamp || !webhookSignature || !secret) {
    return false;
  }
  const ts = Number(webhookTimestamp); // seconds, per Standard Webhooks
  const now = input.now ?? Date.now();
  if (!Number.isFinite(ts) || Math.abs(now - ts * 1000) > 5 * 60 * 1000) {
    return false;
  }
  const payload = `${webhookTimestamp}.${rawBody}`;
  // Accept any of the space-separated "v1,<sig>" entries.
  const signatures = webhookSignature
    .split(" ")
    .filter((s) => s.startsWith("v1,"))
    .map((s) => s.slice(3));
  if (signatures.length === 0) return false;

  // Candidate keys — try both derivations (Polar SDKs do the same).
  const keys: Uint8Array[] = [new TextEncoder().encode(secret)]; // legacy Polar HMAC
  if (secret.startsWith("whsec_")) {
    try {
      keys.push(base64ToBytes(secret.slice("whsec_".length))); // Standard Webhooks
    } catch { /* secret body not valid base64 — legacy scheme only */ }
  } else {
    try {
      keys.push(base64ToBytes(secret));
    } catch { /* ignore */ }
  }

  for (const key of keys) {
    const expected = await hmacSha256Base64(key, payload);
    for (const sig of signatures) {
      if (secretsMatch(sig, expected)) return true;
    }
  }
  return false;
}

// ── event mapping ─────────────────────────────────────────────────────
export const POLAR_SUBSCRIPTION_EVENTS = [
  "subscription.created",
  "subscription.updated",
  "subscription.active",
  "subscription.canceled",
  "subscription.uncanceled",
  "subscription.revoked",
  "subscription.cycled",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
];

// One-time purchases (task 24): order.paid = money received for a one-time
// product → grant a report credit. order.created is acknowledged but has no
// side effects (payment not confirmed yet).
export const POLAR_ORDER_EVENTS = ["order.created", "order.paid"];

interface SubPayload {
  id: string;
  status: string;
  customer_id?: string;
  product_id?: string;
  current_period_start?: string;
  current_period_end?: string;
  started_at?: string;
  cancel_at_period_end?: boolean;
  customer?: {
    id?: string;
    email?: string;
    external_id?: string | null;
    metadata?: Record<string, unknown> | null;
  };
}

interface CurrentRow {
  user_id: string;
  last_event_at: string | null;
}

interface MappedEvent {
  action: "apply" | "ignore";
  reason?: string;
  upsert?: {
    polar_subscription_id: string;
    user_id: string;
    polar_customer_id: string | null;
    polar_product_id: string | null;
    status: string;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    last_event_at: string;
  };
}

/**
 * Map a Polar webhook payload to a subscriptions upsert.
 * User resolution order: customer.external_id → customer.metadata.user_id
 * (set by create-checkout) → userIdHint (email-based lookup in the handler).
 */
export function mapSubscriptionEvent(
  payload: SubPayload,
  eventTime: string,
  current: CurrentRow | null,
  userIdHint?: string | null,
): MappedEvent {
  const metaUserId =
    payload.customer?.metadata &&
    typeof payload.customer.metadata.user_id === "string"
      ? payload.customer.metadata.user_id
      : null;
  const userId = payload.customer?.external_id ?? metaUserId ?? userIdHint ??
    null;
  if (!userId && !current) {
    return { action: "ignore", reason: "no user id on event or existing row" };
  }
  if (
    current && current.last_event_at &&
    new Date(eventTime).getTime() <= new Date(current.last_event_at).getTime()
  ) {
    return { action: "ignore", reason: "stale event (out-of-order)" };
  }
  return {
    action: "apply",
    upsert: {
      polar_subscription_id: payload.id,
      user_id: userId ?? current!.user_id,
      polar_customer_id: payload.customer?.id ?? payload.customer_id ?? null,
      polar_product_id: payload.product_id ?? null,
      status: payload.status,
      current_period_start: payload.current_period_start ??
        payload.started_at ?? null,
      current_period_end: payload.current_period_end ?? null,
      cancel_at_period_end: payload.cancel_at_period_end ?? false,
      last_event_at: eventTime,
    },
  };
}

// ── handler ───────────────────────────────────────────────────────────
const jsonHeaders = { "Content-Type": "application/json" };
const ok = (extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ ok: true, ...extra }), {
    status: 200,
    headers: jsonHeaders,
  });

/** Credit validity window for one-time report purchases. */
const ONE_TIME_CREDIT_DAYS = 90;

type ServiceClient = ReturnType<typeof serviceClient>;

/**
 * order.paid for a one-time product → grant one report credit.
 * Idempotent twice over: the webhook_events marker plus a unique constraint
 * on report_credits.source (the Polar order id).
 */
async function handleOrderPaid(
  payload: Record<string, unknown>,
  supabase: ServiceClient,
): Promise<Response> {
  const product = payload.product as Record<string, unknown> | undefined;
  const productId =
    (typeof payload.product_id === "string" && payload.product_id) ||
    (product && typeof product.id === "string" && product.id) ||
    null;
  if (!productId) return ok({ ignored: "order without product" });

  // Only one-time plans grant credits; subscription orders are handled by
  // the subscription.* events.
  const { data: plan } = await supabase
    .from("plans")
    .select("name, one_time")
    .eq("polar_product_id", productId)
    .eq("one_time", true)
    .maybeSingle();
  if (!plan) return ok({ ignored: "not a one-time product" });

  // User resolution — same order as mapSubscriptionEvent, across the
  // order payload's user/customer shapes.
  const user = payload.user as Record<string, unknown> | undefined;
  const customer = (payload.customer ?? user) as
    | Record<string, unknown>
    | undefined;
  const metaUserId =
    customer?.metadata &&
      typeof (customer.metadata as Record<string, unknown>).user_id === "string"
      ? ((customer.metadata as Record<string, unknown>).user_id as string)
      : null;
  let userId: string | null =
    (user && typeof user.external_id === "string" && user.external_id) ||
    (customer && typeof customer.external_id === "string" && customer.external_id) ||
    metaUserId ||
    null;
  if (!userId) {
    const email =
      (user && typeof user.email === "string" && user.email) ||
      (customer && typeof customer.email === "string" && customer.email) ||
      null;
    if (email) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .limit(2);
      if (prof?.length === 1) userId = prof[0].id as string;
    }
  }
  if (!userId) {
    console.log(
      JSON.stringify({ level: "warn", msg: "one-time order for unknown user", order: payload.id }),
    );
    return ok({ ignored: "unknown user" });
  }

  const orderId = typeof payload.id === "string" ? payload.id : null;
  if (!orderId) return ok({ ignored: "order without id" });

  const expires = new Date(Date.now() + ONE_TIME_CREDIT_DAYS * 864e5)
    .toISOString();
  const { error } = await supabase.from("report_credits").upsert(
    {
      user_id: userId,
      source: orderId,
      expires_at: expires,
    },
    { onConflict: "source", ignoreDuplicates: true },
  );
  if (error) {
    console.error(
      JSON.stringify({ level: "error", msg: "report_credits upsert failed", err: error.message }),
    );
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: jsonHeaders });
  }
  console.log(
    JSON.stringify({
      level: "info",
      msg: "report credit granted",
      order: orderId,
      plan: plan.name,
      expires_at: expires,
    }),
  );
  return ok({ credit: true });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: { code: "method_not_allowed", message: "POST only" },
      }),
      { status: 405, headers: jsonHeaders },
    );
  }
  const env = getEnv();
  const rawBody = await req.text();
  const valid = await verifyWebhookSignature({
    webhookId: req.headers.get("webhook-id"),
    webhookTimestamp: req.headers.get("webhook-timestamp"),
    webhookSignature: req.headers.get("webhook-signature"),
    rawBody,
    secret: env.POLAR_WEBHOOK_SECRET,
  });
  if (!valid) {
    return new Response(
      JSON.stringify({
        error: { code: "unauthorized", message: "Bad signature." },
      }),
      { status: 401, headers: jsonHeaders },
    );
  }
  let event: {
    id?: string;
    type?: string;
    timestamp?: string;
    data?: SubPayload;
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return ok({ ignored: "unparseable" });
  }
  const eventId = event.id;
  const eventType = event.type ?? "";
  const isSubscriptionEvent = POLAR_SUBSCRIPTION_EVENTS.includes(eventType);
  const isOrderEvent = POLAR_ORDER_EVENTS.includes(eventType);
  if (!eventId || (!isSubscriptionEvent && !isOrderEvent)) {
    // Unknown event types: acknowledge so Polar does not retry forever.
    console.log(
      JSON.stringify({ level: "info", msg: "ignored event", type: eventType }),
    );
    return ok({ ignored: eventType || "unknown" });
  }
  const payload = event.data!;
  const eventTime = event.timestamp ?? new Date().toISOString();
  const supabase = serviceClient();

  // One-time purchase flow (task 24): order.created is a no-op ack (payment
  // not confirmed); order.paid grants the report credit. Both carry their
  // own idempotency (marker + unique source), unlike subscriptions they do
  // not need the stale-event guard — a repeat only re-writes the same credit.
  if (isOrderEvent) {
    if (eventType === "order.paid") {
      const result = await handleOrderPaid(payload, supabase);
      // Only mark processed on a clean grant/ignore; leave 500s retryable.
      if (result.status === 200) {
        await supabase.from("webhook_events").upsert(
          { id: eventId, type: eventType, processed_at: new Date().toISOString() },
          { onConflict: "id", ignoreDuplicates: true },
        );
      }
      return result;
    }
    return ok({ acknowledged: eventType });
  }

  // Deduplicate on webhook id (idempotency). The marker row is only written
  // AFTER a successful upsert below, so failures stay retryable.
  const { data: existing } = await supabase
    .from("webhook_events")
    .select("id, processed_at")
    .eq("id", eventId)
    .maybeSingle();
  if (existing) return ok({ deduplicated: true });

  const { data: current } = await supabase
    .from("subscriptions")
    .select("user_id, last_event_at")
    .eq("polar_subscription_id", payload.id)
    .maybeSingle();

  let mapped = mapSubscriptionEvent(payload, eventTime, current ?? null);
  // Email fallback: Polar customers may lack external_id (legacy checkouts);
  // their metadata carries user_id, but fall back to a profiles lookup by
  // customer email when neither is present.
  if (
    mapped.action === "ignore" && mapped.reason?.startsWith("no user id")
  ) {
    const email = payload.customer?.email;
    if (email) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .limit(2);
      if (prof?.length === 1) {
        mapped = mapSubscriptionEvent(
          payload,
          eventTime,
          current ?? null,
          prof[0].id,
        );
      }
    }
  }
  if (mapped.action === "ignore") {
    console.log(
      JSON.stringify({
        level: "info",
        msg: "event ignored",
        reason: mapped.reason,
        sub: payload.id,
      }),
    );
    return ok({ ignored: mapped.reason });
  }
  if (!mapped.upsert!.user_id) {
    console.log(
      JSON.stringify({
        level: "warn",
        msg: "event for unknown user",
        sub: payload.id,
        email: payload.customer?.email ?? null,
      }),
    );
    return ok({ ignored: "unknown user" });
  }
  const up = mapped.upsert!;
  const { error } = await supabase.from("subscriptions").upsert({
    id: crypto.randomUUID(),
    user_id: up.user_id,
    polar_subscription_id: up.polar_subscription_id,
    polar_customer_id: up.polar_customer_id,
    polar_product_id: up.polar_product_id,
    status: up.status,
    current_period_start: up.current_period_start,
    current_period_end: up.current_period_end,
    cancel_at_period_end: up.cancel_at_period_end,
    last_event_at: up.last_event_at,
    updated_at: new Date().toISOString(),
  }, { onConflict: "polar_subscription_id" });
  if (error) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "subscription upsert failed",
        err: error.message,
      }),
    );
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
  // Idempotency marker — after success only.
  const { error: insertEventError } = await supabase
    .from("webhook_events")
    .insert({
      id: eventId,
      type: eventType,
      processed_at: new Date().toISOString(),
    });
  if (insertEventError && insertEventError.code !== "23505") {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "webhook_events insert failed",
        err: insertEventError.message,
      }),
    );
  }
  return ok();
});
