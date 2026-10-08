import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import { z } from "npm:zod@4.6.5";
// ───────────── inlined: auth ─────────────
/**
 * Auth helpers for Edge Functions (spec §7).
 * User endpoints: `Authorization: Bearer <access_token>` verified with
 * supabase.auth.getUser. Writes always use the service-role client, which
 * never leaves Edge Functions.
 */ function getEnv() {
  return {
    SUPABASE_URL: Deno.env.get("SUPABASE_URL") ?? "",
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    APP_URL: Deno.env.get("APP_URL") ?? "http://localhost:3000",
    APP_NAME: Deno.env.get("APP_NAME") ?? "Marketwise",
    ENV: Deno.env.get("ENV") ?? "dev",
    OPENROUTER_API_KEY: Deno.env.get("OPENROUTER_API_KEY") ?? "",
    OPENROUTER_DAILY_CAP: Deno.env.get("OPENROUTER_DAILY_CAP") ?? "45",
    TAVILY_API_KEY: Deno.env.get("TAVILY_API_KEY") ?? "",
    TAVILY_MONTHLY_CAP: Deno.env.get("TAVILY_MONTHLY_CAP") ?? "950",
    POLAR_ACCESS_TOKEN: Deno.env.get("POLAR_ACCESS_TOKEN") ?? "",
    POLAR_WEBHOOK_SECRET: Deno.env.get("POLAR_WEBHOOK_SECRET") ?? "",
    POLAR_SERVER: Deno.env.get("POLAR_SERVER") ?? "sandbox",
    CRON_SECRET: Deno.env.get("CRON_SECRET") ?? ""
  };
}
function serviceClient() {
  const env = getEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
/** Verify a user bearer token. Returns the user id or null. */ async function userIdFromRequest(req) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const env = getEnv();
  // The legacy SUPABASE_PUBLISHABLE_KEY env is not always injected by the
  // platform (new API-key projects may only provide SUPABASE_ANON_KEY /
  // SUPABASE_PUBLISHABLE_KEYS). Fall back so auth never crashes the function.
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!publishableKey) {
    throw new Error("server misconfigured: no publishable key in function env");
  }
  const anon = createClient(env.SUPABASE_URL, publishableKey, {
    auth: {
      persistSession: false
    }
  });
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}
/** Constant-time string compare (spec §11.5). */ function secretsMatch(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for(let i = 0; i < a.length; i++)diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function isCronAuthorized(req) {
  const env = getEnv();
  const presented = req.headers.get("x-cron-secret") ?? "";
  return env.CRON_SECRET.length > 0 && secretsMatch(presented, env.CRON_SECRET);
}
// ───────────── inlined: cors ─────────────
/**
 * CORS + JSON helpers for Edge Functions (spec §7 common rules).
 */ const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Max-Age": "86400"
};
function corsOriginAllowed(origin) {
  if (!origin) return false;
  return origin === "https://get.marketwiselabs.workers.dev" || /^https:\/\/[a-z0-9-]+\.marketwiselabs\.workers\.dev$/.test(origin) || /^https:\/\/preview-[a-z0-9-]+\.space-z\.ai$/.test(origin) || origin === "http://localhost:3000";
}
function corsHeaders(appUrl, env, reqOrigin) {
  const origin = corsOriginAllowed(reqOrigin) ? reqOrigin : appUrl;
  return {
    ...CORS_HEADERS,
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin"
  };
}
function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extra
    }
  });
}
function preflight(appUrl, env, reqOrigin) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(appUrl, env, reqOrigin)
  });
}
// ───────────── inlined: errors ─────────────
/**
 * Typed API error responses (spec §7: `{error:{code,message}}`, correct
 * status, never leak stack traces / upstream bodies).
 */ class ApiError extends Error {
  status;
  code;
  constructor(status, code, message){
    super(message);
    this.status = status;
    this.code = code;
  }
}
function errorResponse(err, cors) {
  if (err instanceof ApiError) {
    return new Response(JSON.stringify({
      error: {
        code: err.code,
        message: err.message
      }
    }), {
      status: err.status,
      headers: {
        "Content-Type": "application/json",
        ...cors
      }
    });
  }
  // Unexpected: log server-side, return a generic message.
  console.error(JSON.stringify({
    level: "error",
    msg: "unhandled",
    error: String(err)
  }));
  return new Response(JSON.stringify({
    error: {
      code: "internal_error",
      message: "Something went wrong. Please try again."
    }
  }), {
    status: 500,
    headers: {
      "Content-Type": "application/json",
      ...cors
    }
  });
}
function badRequest(message, cors) {
  return new Response(JSON.stringify({
    error: {
      code: "bad_request",
      message
    }
  }), {
    status: 400,
    headers: {
      "Content-Type": "application/json",
      ...cors
    }
  });
}
// ───────────── inlined: polar ─────────────
/**
 * Polar (Merchant of Record) integration — spec §9.
 * Plain fetch against the Polar REST API (DECISIONS.md D9: no @polar-sh/sdk
 * under Deno; fewer moving parts, signature verification fully testable).
 *
 * OWNER NOTE (HANDOFF.md): endpoint shapes follow Polar's public v1 API.
 * Re-verify against https://docs.polar.sh/rest-api before going live —
 * the build prompt's "never guess an API" rule applies at deploy time too.
 */ function polarApiBase(server) {
  return server === "production" ? "https://api.polar.sh/v1" : "https://api.sandbox.polar.sh/v1";
}
// ── REST calls ─────────────────────────────────────────────────────────
async function createCheckout(env, args) {
  // Real client IP: sessions created server-side otherwise geo-detect
  // against the server's egress IP, so Polar's currency auto-detection
  // and pre-filled billing country would be wrong for the buyer.
  const ip = typeof args.customerIpAddress === "string" && /^[0-9a-fA-F.:]{3,45}$/.test(args.customerIpAddress) && (args.customerIpAddress.includes(".") || args.customerIpAddress.includes(":")) ? args.customerIpAddress : "";
  const res = await fetch(`${polarApiBase(env.POLAR_SERVER)}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.POLAR_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      // Polar's current v1 schema requires `products` (array); legacy
      // singular `product_id` is rejected with 422 "Field required".
      products: [
        args.productId
      ],
      success_url: args.successUrl,
      // Only send customer_email when present — Polar 422s on empty strings
      // and on domains that do not exist.
      ...args.customerEmail ? {
        customer_email: args.customerEmail
      } : {},
      // Forward the buyer's real IP so Polar picks the right payment
      // currency (products carry EUR + USD prices) and tax country.
      ...ip ? {
        customer_ip_address: ip
      } : {},
      // Link the Polar customer to the Supabase user id. Polar stores this
      // as customer.external_id, which is what the polar-webhook handler
      // uses to attribute subscription events to a user.
      external_customer_id: args.externalCustomerId,
      customer_metadata: {
        user_id: args.externalCustomerId
      }
    }),
    signal: AbortSignal.timeout(20_000)
  });
  if (!res.ok) {
    const body = await res.text().catch(()=>"");
    throw new Error(`polar checkout ${res.status}: ${safeBody(body)}`);
  }
  const data = await res.json();
  if (!data.url) throw new Error("polar checkout response missing url");
  return {
    url: data.url
  };
}
async function createPortalSession(env, args) {
  const res = await fetch(`${polarApiBase(env.POLAR_SERVER)}/customer-portal-sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.POLAR_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      external_customer_id: args.externalCustomerId
    }),
    signal: AbortSignal.timeout(20_000)
  });
  if (!res.ok) {
    const body = await res.text().catch(()=>"");
    throw new Error(`polar portal ${res.status}: ${safeBody(body)}`);
  }
  const data = await res.json();
  if (!data.url) throw new Error("polar portal response missing url");
  return {
    url: data.url
  };
}
function safeBody(body) {
  // Never leak upstream bodies to clients; keep a short prefix for logs.
  return body.slice(0, 120).replace(/\s+/g, " ");
}
/** HMAC-SHA256 → base64 via Web Crypto (Deno + Node 22). */ async function hmacSha256Base64(key, payload) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(key), {
    name: "HMAC",
    hash: "SHA-256"
  }, false, [
    "sign"
  ]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
async function verifyWebhookSignature(input) {
  const { webhookId, webhookTimestamp, webhookSignature, rawBody, secret } = input;
  if (!webhookId || !webhookTimestamp || !webhookSignature || !secret) return false;
  const ts = Number(webhookTimestamp); // seconds, per Standard Webhooks
  const now = input.now ?? Date.now();
  if (!Number.isFinite(ts) || Math.abs(now - ts * 1000) > 5 * 60 * 1000) return false;
  const payload = `${webhookTimestamp}.${rawBody}`;
  // Accept any of the space-separated "v1,<sig>" entries.
  const signatures = webhookSignature.split(" ").filter((s)=>s.startsWith("v1,"));
  if (signatures.length === 0) return false;
  const expected = await hmacSha256Base64(secret, payload);
  for (const sig of signatures){
    if (secretsMatch(sig.slice(3), expected)) return true;
  }
  return false;
}
// ── Webhook payload → subscriptions row mapping (pure, unit-tested) ────
const POLAR_SUBSCRIPTION_EVENTS = [
  "subscription.created",
  "subscription.updated",
  "subscription.active",
  "subscription.canceled",
  "subscription.uncanceled",
  "subscription.revoked"
];
/**
 * Map a Polar webhook payload to a subscriptions upsert. Pure — unit-tested
 * including the out-of-order guard (spec §13).
 *
 * @param payload   the parsed `subscription.*` body
 * @param eventTime timestamp to record (webhook header time or body time)
 * @param current   existing row (if any) for the out-of-order check
 */ function mapSubscriptionEvent(payload, eventTime, current) {
  const userId = payload.customer?.external_id ?? null;
  if (!userId && !current) {
    return {
      action: "ignore",
      reason: "no user id (external_id) on event or existing row"
    };
  }
  if (current && current.last_event_at && new Date(eventTime).getTime() <= new Date(current.last_event_at).getTime()) {
    return {
      action: "ignore",
      reason: "stale event (out-of-order)"
    };
  }
  return {
    action: "apply",
    upsert: {
      polar_subscription_id: payload.id,
      user_id: userId ?? current.user_id,
      polar_customer_id: payload.customer?.id ?? payload.customer_id ?? null,
      polar_product_id: payload.product_id ?? null,
      status: payload.status,
      current_period_start: payload.current_period_start ?? payload.started_at ?? null,
      current_period_end: payload.current_period_end ?? null,
      cancel_at_period_end: payload.cancel_at_period_end ?? false,
      last_event_at: eventTime
    }
  };
}
// ───────────── inlined: main ─────────────
/**
 * create-checkout — spec §7/§9. POST { productId }. Auth required.
 * Creates a Polar checkout; returns { url }. If the user already has an
 * entitled subscription, returns `already_subscribed` (plan changes happen
 * in the portal).
 */ const Body = z.object({
  productId: z.string().min(1).max(200)
});
const ENTITLED = new Set([
  "active",
  "trialing"
]);
Deno.serve(async (req)=>{
  const env = getEnv();
  const cors = corsHeaders(env.APP_URL, env.ENV, req.headers.get("origin"));
  if (req.method === "OPTIONS") return preflight(env.APP_URL, env.ENV, req.headers.get("origin"));
  if (req.method !== "POST") {
    return json({
      error: {
        code: "method_not_allowed",
        message: "POST only"
      }
    }, 405, cors);
  }
  try {
    const userId = await userIdFromRequest(req);
    if (!userId) return json({
      error: {
        code: "unauthorized",
        message: "Sign in first."
      }
    }, 401, cors);
    const parsed = Body.safeParse(await req.json().catch(()=>null));
    if (!parsed.success) {
      return json({
        error: {
          code: "bad_request",
          message: "productId is required"
        }
      }, 400, cors);
    }
    const { productId } = parsed.data;
    const supabase = serviceClient();
    // Plan must exist and be active.
    const { data: plan } = await supabase.from("plans").select("polar_product_id, name, one_time").eq("polar_product_id", productId).eq("active", true).maybeSingle();
    if (!plan) {
      return json({
        error: {
          code: "not_found",
          message: "Unknown plan."
        }
      }, 404, cors);
    }
    // Already subscribed? Plan changes happen in the portal. One-time report
    // purchases (task 24) are always allowed — credits stack on top of a
    // subscription and repeat purchases are legitimate.
    const isOneTime = plan.one_time === true;
    if (!isOneTime) {
      const { data: subs } = await supabase.from("subscriptions").select("status, current_period_end").eq("user_id", userId).order("last_event_at", {
        ascending: false
      }).limit(5);
      const now = new Date();
      const active = (subs ?? []).find((s)=>ENTITLED.has(s.status) && (!s.current_period_end || new Date(s.current_period_end) > now));
      if (active) {
        return json({
          code: "already_subscribed",
          url: null
        }, 200, cors);
      }
    }
    const { data: profile } = await supabase.from("profiles").select("email").eq("id", userId).maybeSingle();
    const { url } = await createCheckout(env, {
      productId,
      successUrl: `${env.APP_URL}/app/checkout/success`,
      externalCustomerId: userId,
      customerEmail: profile?.email ?? "",
      customerIpAddress: req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    });
    return json({
      url
    }, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
