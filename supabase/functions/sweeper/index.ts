import { createClient } from "npm:@supabase/supabase-js@2.117.1";
// ───────────── inlined: _shared/cors.ts ─────────────
/**
 * CORS + JSON helpers for Edge Functions (spec §7 common rules).
 */ const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Max-Age": "86400"
};
function corsHeaders(appUrl, env) {
  const origins = [
    appUrl
  ];
  if (env === "dev") origins.push("http://localhost:3000");
  return {
    ...CORS_HEADERS,
    "Access-Control-Allow-Origin": origins.join(", "),
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
function preflight(appUrl, env) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(appUrl, env)
  });
}
// ───────────── inlined: _shared/errors.ts ─────────────
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
// ───────────── inlined: _shared/auth.ts ─────────────
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
// ───────────── inlined: sweeper/index.ts ─────────────
/**
 * sweeper — spec §7. POST with x-cron-secret (pg_cron every minute).
 * Picks up to 5 jobs in queued/running whose lease expired (oldest first)
 * and calls advance-analysis for each. Fails jobs stuck > 30 minutes.
 *
 * 2026-09-25: also reconciles Polar subscriptions into the `subscriptions`
 * table (poll-based fallback/repair for webhook delivery, which cannot be
 * registered with the current org-token scopes). Throttled in-isolate to
 * at most one Polar sync per 4 minutes; a cold isolate syncs immediately.
 */ let lastPolarSyncAt = 0;
const POLAR_SYNC_INTERVAL_MS = 4 * 60_000;
async function reconcilePolarSubscriptions(env, supabase) {
  const token = env.POLAR_ACCESS_TOKEN;
  if (!token) return {
    skipped: "no polar token"
  };
  const nowMs = Date.now();
  if (nowMs - lastPolarSyncAt < POLAR_SYNC_INTERVAL_MS) {
    return {
      skipped: "throttled"
    };
  }
  lastPolarSyncAt = nowMs;
  const base = env.POLAR_SERVER === "production" ? "https://api.polar.sh/v1" : "https://api.sandbox.polar.sh/v1";
  // Only sync subscriptions for products we sell (FK: polar_product_id → plans).
  const { data: planRows } = await supabase.from("plans").select("polar_product_id");
  const knownProducts = new Set((planRows ?? []).map((p)=>p.polar_product_id));
  let page = 1, synced = 0, skipped = 0, failed = 0, ignoredUsers = 0;
  while(page <= 10){
    const res = await fetch(`${base}/subscriptions?limit=100&page=${page}`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      signal: AbortSignal.timeout(15_000)
    });
    if (!res.ok) throw new Error(`polar subscriptions ${res.status}`);
    const data = await res.json();
    const items = data.items ?? [];
    for (const sub of items){
      try {
        if (knownProducts.size > 0 && !knownProducts.has(sub.product_id)) {
          skipped++;
          continue;
        }
        const { data: current } = await supabase.from("subscriptions").select("user_id, last_event_at").eq("polar_subscription_id", sub.id).maybeSingle();
        // Out-of-order guard: never regress below what a webhook already wrote.
        const eventTime = sub.modified_at ?? sub.current_period_start ?? new Date().toISOString();
        if (current?.last_event_at && new Date(eventTime).getTime() <= new Date(current.last_event_at).getTime()) {
          skipped++;
          continue;
        }
        // User linking: external_id → metadata.user_id → existing row → email.
        let userId = sub.customer?.external_id ?? (sub.customer?.metadata?.user_id && typeof sub.customer.metadata.user_id === "string" ? sub.customer.metadata.user_id : null) ?? current?.user_id ?? null;
        if (!userId && sub.customer?.email) {
          const { data: prof } = await supabase.from("profiles").select("id").eq("email", sub.customer.email).limit(2);
          if (prof?.length === 1) userId = prof[0].id;
        }
        if (!userId) {
          ignoredUsers++;
          continue;
        }
        const { error } = await supabase.from("subscriptions").upsert({
          id: crypto.randomUUID(),
          user_id: userId,
          polar_subscription_id: sub.id,
          polar_customer_id: sub.customer?.id ?? sub.customer_id ?? null,
          polar_product_id: sub.product_id ?? null,
          status: sub.status,
          current_period_start: sub.current_period_start ?? sub.started_at ?? null,
          current_period_end: sub.current_period_end ?? null,
          cancel_at_period_end: sub.cancel_at_period_end ?? false,
          last_event_at: eventTime,
          updated_at: new Date().toISOString()
        }, {
          onConflict: "polar_subscription_id"
        });
        if (error) {
          console.error(JSON.stringify({
            level: "error",
            msg: "polar sync upsert failed",
            sub: sub.id,
            err: error.message
          }));
          failed++;
        } else synced++;
      } catch (e) {
        console.error(JSON.stringify({
          level: "error",
          msg: "polar sync item failed",
          sub: sub?.id,
          err: String(e).slice(0, 200)
        }));
        failed++;
      }
    }
    if (data.pagination?.has_more) page++;
    else break;
  }
  return {
    synced,
    skipped,
    failed,
    ignoredUsers
  };
}
Deno.serve(async (req)=>{
  const env = getEnv();
  const cors = corsHeaders(env.APP_URL, env.ENV);
  if (req.method === "OPTIONS") return preflight(env.APP_URL, env.ENV);
  if (req.method !== "POST") {
    return json({
      error: {
        code: "method_not_allowed",
        message: "POST only"
      }
    }, 405, cors);
  }
  if (!isCronAuthorized(req)) {
    return json({
      error: {
        code: "unauthorized",
        message: "Bad cron secret."
      }
    }, 401, cors);
  }
  try {
    const supabase = serviceClient();
    // 0. Reconcile Polar subscriptions (entitlement repair path).
    let polarSync = null;
    try {
      polarSync = await reconcilePolarSubscriptions(env, supabase);
      if (polarSync && typeof polarSync === "object" && "synced" in polarSync && polarSync.synced > 0) {
        console.log(JSON.stringify({
          level: "info",
          msg: "polar subscriptions reconciled",
          ...polarSync
        }));
      }
    } catch (e) {
      console.error(JSON.stringify({
        level: "error",
        msg: "polar reconcile failed",
        err: String(e).slice(0, 200)
      }));
      polarSync = {
        error: String(e).slice(0, 120)
      };
    }
    const now = new Date().toISOString();
    const stuckCutoff = new Date(Date.now() - 30 * 60_000).toISOString();
    // 1. Fail jobs stuck longer than 30 minutes (spec §7).
    const { data: stuck } = await supabase.from("analysis_jobs").update({
      status: "failed",
      error: "The analysis stalled and could not be recovered. Failed jobs do not count against your quota — please try again.",
      locked_until: null,
      wait_reason: null
    }).in("status", [
      "queued",
      "running"
    ]) // Fail only jobs whose CLAIM LEASE expired long ago (genuinely dead).
    // A healthy multi-step run lasts 20-40 min from creation; created_at-based
    // filtering killed running analyses mid-flight (lease ignored).
    .lt("locked_until", stuckCutoff).is("wait_reason", null).select("id");
    if (stuck && stuck.length) {
      console.log(JSON.stringify({
        level: "info",
        msg: "sweeper failed stuck jobs",
        count: stuck.length
      }));
    }
    // 2. Pick up to 5 lease-expired jobs, oldest first. Jobs waiting on a
    // budget are only resumed once their locked_until (reset time) passed.
    const { data: expired } = await supabase.from("analysis_jobs").select("*").in("status", [
      "queued",
      "running"
    ]).or(`locked_until.is.null,locked_until.lt.${now}`).order("created_at", {
      ascending: true
    }).limit(5);
    const jobs = expired ?? [];
    // 3. Advance each one unit.
    const results = await Promise.allSettled(jobs.map((job)=>fetch(`${env.SUPABASE_URL}/functions/v1/advance-analysis`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": env.CRON_SECRET
        },
        body: JSON.stringify({
          jobId: job.id
        }),
        signal: AbortSignal.timeout(130_000)
      })));
    const advanced = results.filter((r)=>r.status === "fulfilled").length;
    return json({
      ok: true,
      picked: jobs.length,
      advanced,
      polar_sync: polarSync
    }, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
