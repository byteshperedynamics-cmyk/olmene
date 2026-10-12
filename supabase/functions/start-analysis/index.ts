import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import { z } from "npm:zod@4.6.5";
// ───────────── inlined: _shared/cors.ts ─────────────
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
// ───────────── inlined: _shared/shared/input.ts ─────────────
/**
 * StartAnalysisInput — shared between the web form, Edge Functions and the
 * sandbox demo engine. Single source of truth (spec §5).
 */ const GOALS = [
  "first_customers",
  "grow_revenue",
  "improve_conversion",
  "enter_new_market",
  "beat_competitor"
];
const GOAL_LABELS = {
  first_customers: "Get my first customers",
  grow_revenue: "Grow revenue",
  improve_conversion: "Improve conversion",
  enter_new_market: "Enter a new market",
  beat_competitor: "Beat a competitor"
};
const REPORT_LANGUAGES = [
  "English",
  "German",
  "French",
  "Spanish",
  "Portuguese",
  "Italian",
  "Dutch",
  "Polish",
  "Swedish",
  "Danish",
  "Norwegian",
  "Finnish"
];
/**
 * Normalize a user-entered site URL: trim, default to https://, strip
 * credentials and fragment, require http(s), reject obvious garbage.
 * Shared by client form validation and the `start-analysis` function so both
 * sides accept exactly the same set of inputs (spec §10: "client validation
 * mirrors server"). SSRF range checks happen later, at fetch time (§11).
 */ function normalizeSiteUrl(raw) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch  {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  // Bare hostnames like "example" are almost always typos; require a dot.
  if (!url.hostname.includes(".")) return null;
  url.hash = "";
  url.search = "";
  return url;
}
const StartAnalysisInput = z.object({
  siteUrl: z.string().min(1, "Site URL is required").max(2048).refine((v)=>normalizeSiteUrl(v) !== null, {
    message: "Enter a valid http(s) website URL, e.g. https://example.com"
  }),
  productName: z.string().trim().max(120).optional().or(z.literal("")),
  targetMarket: z.string().trim().max(120).optional().or(z.literal("")),
  knownCompetitors: z.array(z.string().trim().max(2048)).max(5).default([]),
  goal: z.enum(GOALS),
  language: z.string().trim().min(2).max(40).default("English")
});
function toSafeInput(input) {
  return {
    siteUrl: normalizeSiteUrl(input.siteUrl)?.toString() ?? input.siteUrl,
    productName: input.productName || undefined,
    targetMarket: input.targetMarket || undefined,
    knownCompetitors: input.knownCompetitors.filter(Boolean),
    goal: input.goal,
    language: input.language || "English"
  };
}
// ───────────── inlined: start-analysis/index.ts ─────────────
/**
 * start-analysis — spec §7. POST StartAnalysisInput. Auth required.
 * Validates + normalizes the URL, checks entitlement, quota (jobs since
 * current_period_start, excluding failed/canceled), max 1 concurrent job,
 * max 10 starts/hour. Inserts the job. NO LLM or Tavily call here.
 */ const ENTITLED = new Set([
  "active",
  "trialing"
]);
const MAX_STARTS_PER_HOUR = 10;
// Mirror of src/lib/quota.ts (Deno can't import from src/) — keep in step.
// Monthly plans count over the billing period; yearly plans over the current
// monthly slice of the year, from the subscription's own day of the month.
function addMonthsClamped(start, months) {
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(start.getUTCDate(), lastDay), start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds()));
}
function quotaWindow(periodStart, periodEnd, billingInterval, now = new Date()) {
  if (billingInterval !== "year") return {
    start: periodStart,
    end: periodEnd
  };
  const start = new Date(periodStart);
  let k = Math.max(0, (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + (now.getUTCMonth() - start.getUTCMonth()));
  while(k > 0 && addMonthsClamped(start, k) > now)k--;
  const next = addMonthsClamped(start, k + 1);
  return {
    start: addMonthsClamped(start, k).toISOString(),
    end: periodEnd && new Date(periodEnd) < next ? periodEnd : next.toISOString()
  };
}
// On-demand Polar self-heal: per-user throttle so a blocked user can not make
// us hammer the Polar API (in-isolate, best effort — cold starts reset it).
const selfHealLastRun = new Map();
/**
 * Pull this user's subscriptions straight from Polar and upsert them, so a
 * just-completed checkout takes effect immediately instead of waiting for
 * the sweeper's periodic reconciliation (or the webhook, which is not yet
 * registered for this Polar organization).
 */ async function selfHealPolarSubscriptions(env, supabase, userId) {
  const token = env.POLAR_ACCESS_TOKEN;
  if (!token) return false;
  const last = selfHealLastRun.get(userId) ?? 0;
  if (Date.now() - last < 30_000) return false;
  selfHealLastRun.set(userId, Date.now());
  const base = env.POLAR_SERVER === "production" ? "https://api.polar.sh/v1" : "https://api.sandbox.polar.sh/v1";
  const headers = {
    Authorization: `Bearer ${token}`
  };
  try {
    const subs = [];
    // 1) customers linked to this user via external_id (set by create-checkout).
    const r1 = await fetch(`${base}/subscriptions?external_customer_id=${encodeURIComponent(userId)}&limit=20`, {
      headers,
      signal: AbortSignal.timeout(10_000)
    });
    if (r1.ok) subs.push(...(await r1.json()).items ?? []);
    // 2) fallback: look the user up by account email in Polar customers.
    const { data: profile } = await supabase.from("profiles").select("email").eq("id", userId).maybeSingle();
    if (profile?.email) {
      const rc = await fetch(`${base}/customers?email=${encodeURIComponent(profile.email)}&limit=5`, {
        headers,
        signal: AbortSignal.timeout(10_000)
      });
      if (rc.ok) {
        for (const c of (await rc.json()).items ?? []){
          const rs = await fetch(`${base}/subscriptions?customer_id=${c.id}&limit=20`, {
            headers,
            signal: AbortSignal.timeout(10_000)
          });
          if (rs.ok) subs.push(...(await rs.json()).items ?? []);
        }
      }
    }
    if (!subs.length) return false;
    // Only sync products we sell (FK: polar_product_id → plans).
    const { data: planRows } = await supabase.from("plans").select("polar_product_id");
    const known = new Set((planRows ?? []).map((p)=>p.polar_product_id));
    let upserted = 0;
    for (const s of subs){
      try {
        if (known.size > 0 && !known.has(s.product_id)) continue;
        const { data: current } = await supabase.from("subscriptions").select("user_id, last_event_at").eq("polar_subscription_id", s.id).maybeSingle();
        const eventTime = s.modified_at ?? s.current_period_start ?? new Date().toISOString();
        if (current?.last_event_at && new Date(eventTime).getTime() <= new Date(current.last_event_at).getTime()) continue;
        const uid = s.customer?.external_id ?? (s.customer?.metadata?.user_id && typeof s.customer.metadata.user_id === "string" ? s.customer.metadata.user_id : null) ?? current?.user_id ?? userId;
        const { error } = await supabase.from("subscriptions").upsert({
          id: crypto.randomUUID(),
          user_id: uid,
          polar_subscription_id: s.id,
          polar_customer_id: s.customer?.id ?? s.customer_id ?? null,
          polar_product_id: s.product_id ?? null,
          status: s.status,
          current_period_start: s.current_period_start ?? s.started_at ?? null,
          current_period_end: s.current_period_end ?? null,
          cancel_at_period_end: s.cancel_at_period_end ?? false,
          last_event_at: eventTime,
          updated_at: new Date().toISOString()
        }, {
          onConflict: "polar_subscription_id"
        });
        if (!error) upserted++;
      } catch (e) {
        console.error(JSON.stringify({
          level: "error",
          msg: "self-heal item failed",
          sub: s?.id,
          err: String(e).slice(0, 150)
        }));
      }
    }
    return upserted > 0;
  } catch (e) {
    console.error(JSON.stringify({
      level: "error",
      msg: "self-heal failed",
      err: String(e).slice(0, 150)
    }));
    return false;
  }
}
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
    if (!userId) {
      return json({
        error: {
          code: "unauthorized",
          message: "Sign in first."
        }
      }, 401, cors);
    }
    const parsed = StartAnalysisInput.safeParse(await req.json().catch(()=>null));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return json({
        error: {
          code: "bad_request",
          message: first?.message ?? "Invalid input"
        }
      }, 400, cors);
    }
    const input = parsed.data;
    const url = normalizeSiteUrl(input.siteUrl);
    if (!url) {
      return json({
        error: {
          code: "bad_request",
          message: "Enter a valid website URL."
        }
      }, 400, cors);
    }
    const supabase = serviceClient();
    // Entitlement: active or trialing subscription (cancellation keeps
    // access until period end because Polar reports status until then).
    const findActiveSub = async ()=>{
      const { data: sub } = await supabase.from("subscriptions").select("status, polar_product_id, current_period_start, current_period_end").eq("user_id", userId).order("last_event_at", {
        ascending: false
      }).limit(5);
      const now = new Date();
      return (sub ?? []).find((s)=>ENTITLED.has(s.status) && (!s.current_period_end || new Date(s.current_period_end) > now)) ?? null;
    };
    let activeSub = await findActiveSub();
    if (!activeSub) {
      // Self-heal before rejecting: a checkout may have completed seconds
      // ago and the periodic sweep has not caught up yet.
      const healed = await selfHealPolarSubscriptions(env, supabase, userId);
      if (healed) activeSub = await findActiveSub();
    }
    // One-time report credits (task 24): a credit funds one analysis when
    // there is no active subscription or the subscription quota is used up.
    // A credit claimed by a failed/canceled job is reusable — failed
    // analyses never count against you.
    const findAvailableCredit = async ()=>{
      const { data: credits } = await supabase.from("report_credits").select("id, job_id, created_at, expires_at").eq("user_id", userId).gt("expires_at", new Date().toISOString()).order("created_at", {
        ascending: true
      }).limit(20);
      if (!credits || credits.length === 0) return null;
      const unclaimed = credits.find((c)=>!c.job_id);
      if (unclaimed) return unclaimed;
      const claimedIds = credits.filter((c)=>c.job_id).map((c)=>c.job_id);
      if (claimedIds.length === 0) return null;
      const { data: jobs } = await supabase.from("analysis_jobs").select("id, status").in("id", claimedIds);
      const deadJobs = new Set((jobs ?? []).filter((j)=>j.status === "failed" || j.status === "canceled").map((j)=>j.id));
      return credits.find((c)=>c.job_id && deadJobs.has(c.job_id)) ?? null;
    };
    let creditFallback = null;
    if (!activeSub) {
      creditFallback = await findAvailableCredit();
      if (!creditFallback) {
        return json({
          error: {
            code: "not_subscribed",
            message: "You need a plan or a single-report credit to run an analysis. See the plans on the pricing page."
          }
        }, 402, cors);
      }
    }
    // Plan quota (subscription path). Plans promise analyses per MONTH, so
    // yearly subscriptions count per monthly slice of the year.
    const now = new Date();
    if (activeSub) {
      const { data: plan } = await supabase.from("plans").select("name, reports_per_period, billing_interval").eq("polar_product_id", activeSub.polar_product_id).maybeSingle();
      const quota = plan?.reports_per_period ?? 0;
      const window = quotaWindow(activeSub.current_period_start ?? new Date(now.getTime() - 30 * 864e5).toISOString(), activeSub.current_period_end ?? null, plan?.billing_interval, now);
      const { count } = await supabase.from("analysis_jobs").select("id", {
        count: "exact",
        head: true
      }).eq("user_id", userId).gte("created_at", window.start).not("status", "in", "(failed,canceled)");
      if ((count ?? 0) >= quota) {
        creditFallback = await findAvailableCredit();
        if (!creditFallback) {
          return json({
            error: {
              code: "quota_exceeded",
              message: `You have used all ${quota} analyses for this month.${window.end ? ` Your quota resets on ${window.end.slice(0, 10)}` : " Your quota resets next month"} \u2014 or buy a single report without subscribing.`
            }
          }, 429, cors);
        }
      }
    }
    // Abuse limit: 1 concurrent job.
    const { count: runningCount } = await supabase.from("analysis_jobs").select("id", {
      count: "exact",
      head: true
    }).eq("user_id", userId).in("status", [
      "queued",
      "running"
    ]);
    if ((runningCount ?? 0) >= 1) {
      return json({
        error: {
          code: "job_in_progress",
          message: "You already have an analysis in progress. Please wait for it to finish."
        }
      }, 429, cors);
    }
    // Abuse limit: 10 starts per hour.
    const hourAgo = new Date(now.getTime() - 3600_000).toISOString();
    const { count: hourCount } = await supabase.from("analysis_jobs").select("id", {
      count: "exact",
      head: true
    }).eq("user_id", userId).gte("created_at", hourAgo);
    if ((hourCount ?? 0) >= MAX_STARTS_PER_HOUR) {
      return json({
        error: {
          code: "rate_limited",
          message: "Too many analyses started this hour. Please try again later."
        }
      }, 429, cors);
    }
    const { data: job, error } = await supabase.from("analysis_jobs").insert({
      user_id: userId,
      site_url: url.toString(),
      input: toSafeInput(input),
      status: "queued",
      current_step: "crawl",
      step_outputs: {},
      step_log: []
    }).select("id").single();
    if (error || !job) {
      throw new Error(`job insert failed: ${error?.message ?? "unknown"}`);
    }
    // Claim the one-time credit for this job (task 24). If the claim is lost
    // (should be impossible under the 1-concurrent-job limit), cancel the
    // job and reject so the credit is never silently burned.
    if (creditFallback) {
      const { data: claimed, error: claimError } = await supabase.from("report_credits").update({
        job_id: job.id
      }).eq("id", creditFallback.id).select("id").maybeSingle();
      if (claimError || !claimed) {
        await supabase.from("analysis_jobs").update({
          status: "canceled",
          error: "report credit could not be claimed"
        }).eq("id", job.id);
        return json({
          error: {
            code: "quota_exceeded",
            message: "Your report credit could not be applied. Please try again."
          }
        }, 429, cors);
      }
    }
    // Start the pipeline on the server right away: advance-analysis claims the
    // job, runs the crawl in the background and queues each next step itself,
    // so the report finishes whether or not the browser tab stays open.
    if (env.CRON_SECRET) {
      const kick = fetch(`${env.SUPABASE_URL}/functions/v1/advance-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": env.CRON_SECRET },
        body: JSON.stringify({ jobId: job.id, background: true }),
        signal: AbortSignal.timeout(15_000)
      }).then((r)=>r.body?.cancel()).catch(()=>{});
      const rt = globalThis.EdgeRuntime;
      if (rt && typeof rt.waitUntil === "function") rt.waitUntil(kick);
      else await kick;
    }
    return json({
      jobId: job.id
    }, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
