# MarketWise Architecture Audit — Phase 0

**Date:** 2026-09-29 · **Repo state:** `main` @ HEAD (Task 30) · **Auditor:** agent (Phase 0 of the "apply-fixes agent" spec)

**Method.** Every claim below was verified one of two ways: (a) reading the current source tree, or (b) querying live state — the Supabase Management API (deployed function list, RLS/policy catalog, `pg_cron`, Vault) and a **fresh fetch of every deployed function body** (scratch/live-fns/) to diff against local sources. Local file references use `path:line` where stable. Anything that is a *recommendation* rather than a fact is explicitly labeled as such.

---

## 0. Executive summary

The existing architecture is a strong foundation for the agent feature — the hard parts already exist in production shape: a lease-based job queue with a chunked state machine, a service-role-only write layer, RLS-scoped browser reads, a deterministic check engine, and an action-feed-style progress UI. Four things gate Phase 1:

1. **CRITICAL — committed live secrets.** A Supabase Management PAT (full project admin) is hardcoded in **16 scripts**; the Polar webhook signing secret is committed as a plain file; a Cloudflare R2 secret key is committed; a 47/48-char Cloudflare API token is committed. No git remote exists (local-only repo), which limits exposure — but we cannot credibly ask users for scoped credentials while our own god-token sits in the tree. Rotation is a **precondition** for Phase 1 (user action required; runbook in §4.3).
2. **Findings have no stable IDs.** Report findings and checklist items are rendered by array index; only sources have IDs (`S1…`). The Fixer Registry keys on the *deterministic checklist labels* (stable de facto, 21 checks) — fine for v1 fixers, but a stable slug field should be added to the report schema (see §2.4).
3. **Function source layout is drifted and confusing.** `fnsrc/` holds three generations of sources plus 70 MB of stale binaries. Verified: production runs the **newest** generation for all 8 functions (§2.6). Phase 1 should consolidate into a standard `supabase/functions/` tree as the single source of truth.
4. **No type gate, no CI, no automated tests for functions.** `typescript.ignoreBuildErrors: true` (next.config.ts:9) means type errors never block a deploy. The agent's allowlist validator / SQL guard / redaction MUST ship with a real test harness (deno test, like `scripts/pipeline_tests/`).

---

## 1. Stack, framework, build & deploy

| Layer | What (verified) |
|---|---|
| Framework | Next.js `^16.1.1`, React 19, all pages `"use client"` (no RSC data layer in practice) |
| Styling | Tailwind CSS 4, shadcn/ui components (`src/components/ui/*`), framer-motion |
| Adapter | `@opennextjs/cloudflare ^1.6.0`; `open-next.config.ts` uses cloudflare-node wrapper, edge converter, dummy caches, external middleware |
| Worker | `wrangler.jsonc`: worker **`get`** → https://get.marketwiselabs.workers.dev, `nodejs_compat` + `global_fetch_strictly_public`, compat date 2025-09-01, `observability.enabled: true` |
| **CF bindings** | **`ASSETS` only.** No KV, no R2, no D1, no Queues, no cron triggers, no vars/secrets. All durable state lives in Supabase. |
| Backend | Supabase (Postgres + RLS + Auth + Edge Functions) at `ffoevhldpppyfsfgufmx.supabase.co`; payments via Polar (MoR) |
| Frontend deploy | `scripts/deploy_frontend.sh` — OpenNext build → `wrangler deploy`; requires `CLOUDFLARE_API_TOKEN` env; account ID hardcoded (line 19, INFO severity); `SKIP_BUILD=1` reuses staged `.open-next/` |
| Functions deploy | `scripts/deploy_fn.py` — Supabase Management API, uses the committed PAT (§4.2); **`verify_jwt: false`** on deploy (line 12,18) |
| Scheduling | **pg_cron inside Supabase**, not Cloudflare cron: job `sweep-jobs`, `* * * * *`, calls `net.http_post(...)` (pg_net) → `${SUPABASE_URL}/functions/v1/sweeper` with `x-cron-secret` read from **Supabase Vault** via `public.vault_secret('cron_secret')` |
| Vestigial | Prisma + `db/custom.db` (empty sqlite scaffold; `src/lib/db.ts` never imported), `next-auth` dep (never imported), `src/app/api/route.ts` ("Hello world" scaffold). `Caddyfile` = local dev proxy only. |

Implications for the agent feature:
- OAuth callbacks and broker endpoints can live in **Supabase Edge Functions** (already the pattern) — no new Cloudflare bindings are required.
- There is **no server-side session in the Worker**; the Next app is effectively a static-ish client. Auth is done client-side and re-verified per function call (§3).
- The Worker has no secret store in use — if any agent secret ever needs to live Cloudflare-side, it would be a Wrangler secret (none exist today).

---

## 2. The analysis pipeline

### 2.1 End-to-end flow

1. **Client** (`src/app/app/new/page.tsx`) → POST `start-analysis` (Bearer user JWT).
2. `start-analysis` (service role): validates input + SSRF-safe URL normalization → **entitlement gate** (§5) → inserts `analysis_jobs` row (`status: queued`, `current_step: crawl`, `input: {goal, language, productName}`) → returns job id. Also: 1 concurrent job / user, 10 job-starts / hour / user.
3. **Frontend driver loop** (`src/app/app/report/page.tsx:19-80`): react-query polls `getJob` every 1.5 s AND calls `advance-analysis(jobId)` repeatedly (500 ms reschedule, exp. backoff 1 s→30 s). Each invocation executes **exactly one unit of work** under a lease and returns; this is how the pipeline survives Edge Function wall-clock limits.
4. **sweeper** (cron, every minute): pumps up to 5 unlocked `queued|running` jobs by POSTing them to `advance-analysis` with the cron secret (130 s timeout); kills jobs stuck `locked_until < now()−30 min` (and `wait_reason is null`); (newer generation) reconciles Polar subscriptions.
5. `advance-analysis` **dual auth**: user JWT with **owner check** (`job.user_id !== authUserId` → 403), **or** `x-cron-secret` (constant-time compare). One step per invocation via RPC `claim_job(p_job_id, p_lease_seconds ⇒ 150)`. On success: `current_step` advances, `locked_until: null`. On failure: `attempts++`, retry backoff `locked_until = now()+30 s`; ≥3 attempts on a step → `status: failed` with user-safe message. Budget exhaustion → `wait_reason: llm_daily_budget | tavily_monthly_budget`, `locked_until = next UTC midnight + jitter`.

### 2.2 The 10 steps (STEP_IDS, in order)

`crawl → profile → research → competitors_pick → competitors_extract → competitors_analyze → audit → market → strategy → assemble`

| Step | Work | LLM? | Notes |
|---|---|---|---|
| `crawl` | fetch homepage (10 s, 1 MB, 3 redirects, HTML-only, DNS-pinned SSRF guard), rank+fetch ≤4 internal pages, probe `/robots.txt` + `/sitemap.xml`, compute deterministic `seoSignals`; Tavily Extract fallback if page < 500 chars | — | signals stored in `analysis_jobs.step_outputs.crawl.seoSignals` |
| `profile` | product profile | ✅ (max_tokens 3000) | zod-validated JSON |
| `research` | Tavily search 5–7 queries → `sources[] S1..S25`; fails if <3 | — | `TAVILY_API_KEY`, monthly cap 950 (budget key `tavily:YYYY-MM`) |
| `competitors_pick` | LLM picks competitor URLs → **code-filtered** against sources∪input pool; deterministic top-up to ≥3 | ✅ | |
| `competitors_extract` | Tavily Extract batch + fetchPage fallback | — | |
| `competitors_analyze` | competitor cards | ✅ | |
| `audit` | LLM findings (messaging/conversion/seo/trust/pricingPresentation, 1–10 each) **fed with deterministic SEO signals as facts** | ✅ (5000) | |
| `market` | market size (cited), trends, segments | ✅ | |
| `strategy` | exec summary + `Scores{overall,messaging,positioning,conversion,seo,trust}`, strategy, 7/30/60/90 roadmap, risks, assumptions | ✅ (5000) | |
| `assemble` | pure code: prune unknown sourceIds, null uncited market size, clamp scores, **blend SEO score (0.5 LLM + 0.5 deterministic checklist)**, insert `reports` row | — | |

**LLM transport (deployed, verified in live body):** model list read from the `llm_models` table → currently 5 active models: `google/gemini-3.5-flash-lite` (prio 5), `google/gemini-3.6-flash` (6), `google/gemini-3.5-flash` (7), `glm-4.7-flash` (10), `glm-4.5-flash` (11). Routing: `google/*` → Gemini OpenAI-compat endpoint (`GEMINI_API_KEY`); everything else → **Z.ai GLM** (`https://api.z.ai/api/paas/v4/chat/completions`, `GLM_API_KEY`, `thinking: disabled`). Rotation over 5 attempts; temperature 0.3; per-step `max_tokens`. Budget RPC `consume_budget` before **every** attempt: `llm:YYYY-MM-DD` (daily cap, default 500) and `llmrpm:YYYY-MM-DDTHH:mm` (30/min). *(The OpenRouter transport exists only in old local snapshots — 0 hits for `OPENROUTER_API_KEY` in the deployed body.)*

### 2.3 Deterministic checks — the current contract for fixers

21 checks (18 original + 3 added in the Sep-25 deploy), produced by `computeSeoSignals`/`buildChecklist` and used identically by the full pipeline and the **free-audit** function:

| # | Check label (exact string) | Fail behavior |
|---|---|---|
| 1 | `Title tag` | missing = fail |
| 2 | `Meta description` | missing = fail |
| 3 | `Single H1` | 0 = fail |
| 4 | `Heading structure` | 0 H2/H3 = fail |
| 5 | `Canonical URL` | warn only |
| 6 | `Language attribute` | warn |
| 7 | `Mobile viewport` | missing = fail |
| 8 | `Open Graph tags` | warn |
| 9 | `Social preview image (og:image)` *(new)* | warn |
| 10 | `Favicon` *(new)* | warn |
| 11 | `HTTPS` *(new)* | http = fail |
| 12 | `Twitter card` | warn |
| 13 | `Structured data (JSON-LD)` (supports `@graph`) | warn |
| 14 | `Image alt coverage` | >50% missing = fail; 0 imgs = warn |
| 15 | `Content depth` | <100 words = fail |
| 16 | `Pricing page` | warn |
| 17 | `Call-to-action` | none = fail |
| 18 | `Trust signals` | 0 = fail |
| 19 | `Robots meta` | noindex = fail |
| 20 | `/robots.txt` (200) | warn |
| 21 | `/sitemap.xml` (200) | warn |

Checklist item shape: `{ check: string ≤300, status: "pass"|"warn"|"fail", detail: string ≤600 }` — `detail` carries the extracted evidence (title length, H1 text, alt-coverage counts, robots/sitemap HTTP status…). The user-facing spec said "18 deterministic HTML checks" — production now runs **21**; the free tier surfaces ≤4 findings deterministically (no LLM) plus `hiddenFindings` count.

### 2.4 Report storage & finding identity

- Table **`reports`**: `id, job_id, user_id, title, data (jsonb), models_used`. Report JSON `meta.schemaVersion: 1`.
- Top-level report shape (mirrored by `src/lib/report-types.ts`): `meta`, `executiveSummary` (incl. `scores`), `product`, `market` (size with `sourceIds`), `competitors[]`, `audit` (`messaging/conversion/trust/pricingPresentation` arrays + `seo.checklist[]` + `seo.findings[]`), `strategy`, `roadmap{quickWins,days30,days60,days90}`, `risks`, `assumptions`, `sources[]`.
- **LLM finding shape:** `{ title, severity: critical|high|medium|low, evidence, recommendation }` — free text, **no ID**.
- **Only sources have IDs** (`S1…`, regex `^S\d+$`); findings/checklist items are identified by array index in the UI (`report-viewer.tsx` `key={i}`).
- **Consequence for the Fixer Registry:** the first 8 fixers in the spec map 1:1 onto *deterministic checklist labels* (§2.3) + `analysis_jobs.step_outputs.crawl.seoSignals` — these are stable strings and are the right join key. Copy rewrites (H1/CTA) join on LLM finding titles/evidence with a confidence gate ("skip rather than guess" — existing rule). *Recommendation:* add `id` slugs (`seo.meta_description`, `seo.canonical`, …) to `checklist[]`/`findings[]` under `schemaVersion: 2`; keep label-matching as the fallback for existing reports.

### 2.5 Job state machine (verified)

- `analysis_jobs`: `id, user_id, site_url, input, status, current_step, step_outputs (jsonb keyed by step), step_log (array), error, wait_reason, locked_until, attempts, created_at, started_at, completed_at`.
- Statuses: `queued | running | completed | failed | canceled`; per-step statuses: `pending | running | done | failed | skipped`.
- RPCs: `claim_job(job_id, lease_seconds)` (atomic lease), `consume_budget(key, n)` (usage_counters-based).
- ⚠️ `HARD_DEADLINE_MS = 120_000` is **declared but never enforced** in either generation — the only wall-clock bounds are the sweeper's 130 s fetch timeout and lease expiry. (Minor; worth fixing in the agent runner, which must enforce per-action timeouts for real.)

### 2.6 Deployed vs local — settled

Live Management API list (2026-09-29): **8 active functions** — `advance-analysis, create-checkout, create-portal-session, free-audit, health, polar-webhook, start-analysis, sweeper`. Fresh body fetch confirms production runs the **newest generation of all of them** (GLM/Gemini routing + all six pipeline enhancements; polar-webhook with `order.paid` → `report_credits` + dual `whsec_` derivation; start-analysis with credits/self-heal/CORS allowlist; sweeper with Polar reconcile). **`polar-admin`, `polar-admin-onetime`, `env-probe`, `diag-llm` are NOT deployed** — the temporary admin functions were deleted as intended; the two unauthenticated-admin findings from the code read are moot in production.

`verify_jwt`: **False on 7 of 8** (only `create-portal-session` True) — every function performs its own Bearer/owner or HMAC/cron check. This is the pattern new broker functions must follow (the platform gate is off).

---

## 3. Auth & data model (Supabase)

### 3.1 Auth model

- **Supabase Auth, email OTP magic-link only**, PKCE flow, session persisted in **localStorage** by supabase-js (`src/lib/supabase.ts`); access token attached per-request as `Authorization: Bearer` by `src/lib/api.ts`.
- Client created with the **publishable key** (`sb_publishable_…`) — public-by-design; the **service-role key never appears in `src/`** (verified by scan).
- **Route protection is client-side only** (`src/app/app/layout.tsx` redirects to `/login/`); there is **no middleware.ts**. The real data boundary is RLS.
- `verify_jwt: false` on deployed functions (§2.6) — each function re-verifies the JWT itself via `anon.auth.getUser(token)` and enforces ownership server-side.
- Auth-schema extras present: `custom_oauth_providers`, `oauth_*`, `scim_*`, `saml_*`, `webauthn_*` tables (0 rows — Supabase auth schema defaults, not used).

### 3.2 Tables, RLS, policies (live-verified)

Public schema — 10 tables, **RLS enabled on all 10**:

| Table | Rows | SELECT policy | Write path |
|---|---|---|---|
| `analysis_jobs` | 8 | `user_id = auth.uid()` | service role only (start/advance/sweeper) |
| `reports` | 8 | `user_id = auth.uid()` | service role only (assemble) |
| `subscriptions` | 1 | `user_id = auth.uid()` | service role only (polar-webhook, sweeper, start self-heal) |
| `report_credits` | 0 | `user_id = auth.uid()` | service role only (polar-webhook `order.paid`) |
| `plans` | 3 | `active` (public read) | service role only |
| `profiles` | 5 | `id = auth.uid()` | service role only |
| `free_audits` | 72 | **no policy** → service-role only | service role (free-audit fn) |
| `llm_models` | 5 | **no policy** → service-role only | service role |
| `usage_counters` | 269 | **no policy** → service-role only | service role (consume_budget RPC) |
| `webhook_events` | 0 | **no policy** → service-role only | service role (polar-webhook dedup) |

Key structural facts:
- **There are NO INSERT/UPDATE/DELETE policies for `anon`/`authenticated` on any table.** Every write in the system flows through an Edge Function using the service-role key, which bypasses RLS. The browser only ever reads. This is exactly the "service role only inside the server tool layer" discipline the agent spec (§3.E) demands — it already exists and must be preserved.
- At the **grant** level, `anon`/`authenticated` still hold ALL privileges on all public tables (default Supabase grants; RLS is the only barrier; PostgREST does not expose TRUNCATE). *Hardening opportunity (recommendation, not a live hole):* `REVOKE INSERT/UPDATE/DELETE/TRUNCATE ON public.plans, public.llm_models, public.usage_counters, public.webhook_events, public.free_audits FROM anon, authenticated;`
- User data lives **only** in this project: `auth.users` (5 users), `profiles`, job/report rows. `free_audits` stores `{ip, url}` (IP retention ~24 h via 1%-probability prune).

### 3.3 Supabase Vault (already in use)

- `supabase_vault` extension installed; **2 secrets**: `functions_base_url`, `cron_secret` (names verified; values not read).
- `public.vault_secret(name)` is `SECURITY DEFINER`, executable **only by `postgres` + `service_role`** — not exposed to anon. The pg_cron job uses it to inject the cron secret into the sweeper call.
- *Relevant to the Connection Broker:* a Vault already exists, but the spec requires broker encryption keys held **outside the database**. Both options are viable (edge-function env secret as master key, or Vault); decision needed (§8).

### 3.4 Scale (live counts)

5 auth users, 8 jobs, 8 reports, 1 subscription, 72 free audits, 269 usage counters. Small — migrations are cheap; no legacy scale to worry about.

---

## 4. Current secret handling

### 4.1 Runtime secret inventory (where legit secrets live)

All application secrets are **Supabase Edge Function environment secrets**, read via `Deno.env.get`:

| Secret | Used by |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | every function (service client) |
| `SUPABASE_PUBLISHABLE_KEY` (+ legacy `SUPABASE_ANON_KEY` fallback in older gen) | JWT verification in start/advance/checkout/portal |
| `GLM_API_KEY`, `GEMINI_API_KEY` (+ caps `GLM_DAILY_CAP`, `RPM_CAP`) | advance-analysis, diag-llm |
| `TAVILY_API_KEY` (+ `TAVILY_MONTHLY_CAP`) | advance-analysis, free-audit |
| `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_SERVER` | create-checkout, create-portal-session, sweeper, start-analysis, polar-webhook |
| `CRON_SECRET` | sweeper, advance-analysis (dual mode), pg_cron job (via Vault) |
| `APP_URL`, `APP_NAME`, `ENV` | CORS defaults, referer/title headers |

Client-side (baked into the bundle, public-by-design): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_GA_MEASUREMENT_ID` — with **hardcoded production defaults in `src/lib/config.ts`**, so dev builds talk to prod (mild footgun; recommend requiring env instead of defaulting).
Worker-side: **no Wrangler secrets or vars exist**. The Cloudflare API token used for deploys is passed per-invocation via env, never stored in the repo.

### 4.2 Committed secrets — CRITICAL findings (git-tracked, verified)

| ID | What | Where (git-tracked) | Blast radius | Severity |
|---|---|---|---|---|
| S1 | Supabase **Management PAT** (`sbp_fc…`, 44 chars) | 16 scripts: `db_query*.py`, `list_secrets.py`, `fn_logs*.py`, `fetch_fn.py`, `deploy_fn.py`, `list_fns.py`, `del_fn.py`, `configure_smtp.py`, `check_auth_config.py`, `fix_auth_config.py`, `insert_test_console_job.py`, `diagnose_signin.py`, `setup_success_test_user.py`, `pipeline_tests/bench.py:38` | **Full project admin**: deploy/replace/delete functions, **run arbitrary SQL** (read `auth.users`, all app tables), read/update function secrets, rewrite auth config | **CRITICAL** |
| S2 | **Polar webhook signing secret** (`whsec_…`) | `scripts/polar_webhook_secret.txt` (entire file) | Forge signed webhook events → fabricate `subscription.active` → **grant paid entitlements without paying**; unrotated since first commit | **CRITICAL** |
| S3 | Cloudflare **R2 secret access key** (64 hex) | `scripts/test_auth_combos.py:8` | R2 operations on account `7948…` | **HIGH** |
| S4 | Cloudflare **API token, 47 of 48 chars** (one char dropped) | `recover_cf_token*.py`, `test_auth_combos.py:7` | Account-scoped ops if recovered (the repo ships its own brute-force helper); possibly already auto-revoked by Cloudflare | MEDIUM |
| S5 | Cloudflare **account ID** | `deploy_frontend.sh:19` + 4 scripts | Recon only | INFO |
| S6 | QA test-user passwords (`QaTest…`, mail.tm password) | `bench.py:40`, `test_checkout.py`, `setup_success_test_user.py`, `mailtm_reauth_poll.py` | Log into QA users in the prod project; read disposable inbox | LOW |
| S7 | `.env` is git-tracked (currently only `DATABASE_URL` sqlite path; an older committed version held only public-by-design values) | `.env` | Hygiene | LOW |

History scan: 48 commits, **no remote configured** (local-only — the only reason these are not yet leaked). No OpenRouter/GitHub/Brevo/Polar-org tokens were ever committed. `.gitignore` covers `.env*`/`*.eszip` but **tracked files bypass ignore rules**; `polar_webhook_secret.txt` was not ignored (now is).

### 4.3 Required rotation runbook (user action — gate for Phase 1)

1. **Supabase PAT**: dashboard → Account → Access Tokens → revoke `sbp_fc…`; create a new one stored **only** in a shell env var / password manager; refactor the 16 scripts to read `SUPABASE_PAT` from env (pattern already exists in `configure_smtp.py` for Brevo creds).
2. **Polar webhook secret**: Polar dashboard → webhook endpoint → regenerate secret → update the `POLAR_WEBHOOK_SECRET` function secret → delete `scripts/polar_webhook_secret.txt` from the tree.
3. **Cloudflare R2 key**: roll the R2 token; **Cloudflare API token**: the one pasted in chat earlier this month should also be considered burned (it already appeared in conversation; you planned to roll it — confirm).
4. Purge: `git rm --cached .env fnsrc/*.eszip db/custom.db`; delete one-off forensic scripts (`recover_cf_token*.py`, `test_auth_combos.py`); since there is **no remote**, a history rewrite (`git filter-repo`) is cheap **now** and expensive later — recommended before this repo is ever pushed.
5. Add a pre-commit secret scanner (e.g. gitleaks hook) so this class of leak cannot recur while we hold third-party credentials.

---

## 5. Entitlement & billing (existing logic)

- **Plans** (live `plans` table): Starter `$19/mo` — 2 reports/period; Pro `$29/mo` — 4 reports/period; Single Report `$14 once` — 1 report credit, 90-day expiry. Polar product IDs are stored on the rows (`7e27d794…` Starter, `9f1761be…` Pro, `67f74220…` Single Report).
- **Checkout**: client → `create-checkout` (auth required, plan validated active) → Polar `POST /v1/checkouts` with `external_customer_id = supabase user id` + `customer_metadata.user_id` → redirect → success page polls entitlement (3 s × 45 s) while the webhook lands.
- **Webhook** (`polar-webhook`): Standard-Webhooks HMAC-SHA256 over raw body (±5 min, dual `whsec_` derivation), **dedup via `webhook_events`** (unique event id, 23505-tolerant), out-of-order guard via `last_event_at`; `subscription.*` → upsert `subscriptions`; `order.paid` (one-time) → insert `report_credits` (90-day expiry, `source = orderId` unique).
- **Self-healing**: `start-analysis` pulls the user's Polar subscriptions directly (throttled 30 s/user per isolate) before rejecting; `sweeper` reconciles all subscriptions every run.
- **Quota enforcement** (server-authoritative, in `start-analysis`): active sub → `count(analysis_jobs ≥ current_period_start, excluding failed/canceled) < reports_per_period`, else 402 `not_subscribed` / 429 `quota_exceeded`; or an available `report_credits` row (a credit claimed by a failed/canceled job is **not** burned); 1 concurrent job; 10 starts/hour.
- **Gap for the agent feature:** entitlement is single-dimensional (reports). The spec requires: Free = plan+preview only; Paid = apply, **counted in actions**. A second dimension (actions per period) must be added — amounts are a user decision (§8).

---

## 6. Gaps & risks relevant to holding third-party credentials

| # | Gap / risk | Evidence | Impact for the broker/agent |
|---|---|---|---|
| G1 | **Committed god-credentials** (§4.2) | 16 files + secret txt | Precondition failure — rotate before storing any user token |
| G2 | **No stable finding IDs** | `report-viewer.tsx` `key={i}`; §2.4 | Fixer↔finding mapping must key on checklist labels; add slugs in schema v2 |
| G3 | **Shared `CRON_SECRET`** grants job-advance on any job (owner check bypassed for cron-auth callers) | advance-analysis dual auth | Acceptable today; the agent runner needs a **per-job** capability token instead of one global secret, or the same bypass applies to apply-steps |
| G4 | **Service-role key = full DB access** in every function | all fns | Broker tables will be writable by any compromised function; mitigate with dedicated policies + keeping the token-encryption key outside the DB (spec requirement) |
| G5 | **No encryption-at-rest for third-party tokens exists yet** | — | Must be built (envelope encryption: per-connection DEK, master key as edge-function env secret; AES-GCM via WebCrypto is available in Deno) |
| G6 | **PII in logs**: `polar-webhook` logs customer email on unknown-user events; `free_audits` stores IPs | polar-webhook-fixed.ts:450-457; free-audit:466 | Logging discipline for tokens must be stricter than current PII discipline: structured JSON logs exist, but add a redaction layer + tests |
| G7 | **No error tracking / observability** beyond console logs + CF `observability.enabled` | — | Kill switch + incident response (spec §10) need at minimum a health/status table and log greppability; consider Sentry later |
| G8 | **Rate limiting is sparse**: free-audit 8/h/IP (best-effort, failures swallowed); starts 1-concurrent + 10/h/user; no limits on advance-analysis polls beyond natural backoff | §5 | Broker endpoints (OAuth callbacks, token exchange, agent steps) need their own limits from day one |
| G9 | **CORS is correct in current generation** (origin allowlist: prod workers.dev, `preview-*.space-z.ai`, localhost:3000) but the pattern lives duplicated in every function | fnsrc | Extract to a shared module when building new functions; the `polar-admin` CORS `*` pattern is gone from prod (not deployed) |
| G10 | **`typescript.ignoreBuildErrors: true`** and no CI/test gate | next.config.ts:9 | The allowlist validator, SQL guard, and redaction must ship with `deno test` suites (pattern: `scripts/pipeline_tests/unit_tests.ts`); consider flipping ignoreBuildErrors off for agent codepaths |
| G11 | **Deploy drift / source-of-truth confusion** | §2.6; three generations in `fnsrc/` | Consolidate to `supabase/functions/` with a per-function deploy script before adding 6+ new functions |
| G12 | **`HARD_DEADLINE_MS` dead code**; only sweeper 130 s timeout bounds run time | §2.5 | Agent runner must enforce real per-action timeouts (spec §5.4) |
| G13 | **Client-side-only route protection** (no middleware) | §3.1 | Acceptable (RLS is the boundary) but the connect screen must never render token material; all broker pages are client pages like today |
| G14 | **Vestigial deps/scaffold** (next-auth, Prisma, api/route.ts, db/custom.db) | §1 | Remove during Phase 1 cleanup to shrink attack surface |

---

## 7. Where the new components should live *(recommendation — confirm in §8)*

Mapping the spec's components (A–E) onto what exists:

- **A. Connection Broker** → new Supabase Edge Functions (`connect-<provider>`, `<provider>-callback`, `disconnect-<provider>`), one shared module per provider implementing the OAuth/app-install flows; tokens stored **encrypted** in a new `connections` table (per-connection DEK, master key from function env — outside the DB, satisfying the spec). `getScopedClient(jobId, provider)` lives in the same shared module and is importable only by agent functions (Deno module boundary, not a network service — the LLM never sees it because only the deterministic layer imports it).
- **B. Fixer Registry** → a Deno module registry (deterministic TypeScript, no LLM): `detect → plan → preview → apply → verify → rollback` per fixer; validated against a per-job allowlist before execution (spec §5.2).
- **C. Agent Runner** → **reuse the job queue pattern exactly**: new `agent_jobs` table with the same lease/step/status machinery (`claim_job` pattern), driven by the existing `sweeper` (one more pump loop) and a client driver loop. The LLM (GLM via `llm_models` routing + `consume_budget` with new `agent:*` keys) is used **only to draft plans and copy**, never to choose tools outside the allowlist — the validator is code, not prompts.
- **D. Audit log & receipts** → `agent_actions` append-only table (service-role writes, user-SELECT policy), before/after hashes, redacted args; receipts rendered client-side (existing print-to-PDF + markdown export infra in `format.ts` / `print-report.tsx`).
- **E. Data model** → new tables `connections, agent_jobs, planned_actions, approvals, applied_actions, revocations, receipts` in public schema with the same policy discipline as §3.2 (SELECT-own for users, no user-role writes, all writes service-role from functions).
- **UI** → `/app/agent/` pages behind a feature flag (`NEXT_PUBLIC_FEATURE_AGENT`, default off), reusing `agent-console.tsx`'s timeline + polling patterns for the live action feed; connect screen, diff viewer with per-change + batch approval, disconnect/verify step, receipt page.
- **Feature flag** → env-based on both the frontend (hide entry points) and functions (`agent-runner` refuses to start jobs unless `FEATURE_AGENT=on` server-side too).

---

## 8. Open questions — material decisions for you → **ANSWERED 2026-09-29**

| # | Question | Decision (user) | Consequence |
|---|---|---|---|
| 1 | Rotate committed credentials before Phase 1? | **Skip rotation** (risk accepted; no git remote exists) | Runbook §4.3 stays for later; no gate. Risk noted: the committed PAT remains valid — mitigate by never pushing this repo to a remote without §4.3. |
| 2 | GitHub App creation | **Create now** — manifest provided; user registers it; credentials auto-captured encrypted via the manifest-callback flow (see docs/integrations.md §1.3) | Blocking step for live E2E only, not for the build |
| 3 | Broker placement | **Cloudflare Worker** (Next.js API routes), *not* Edge Functions as I recommended | §7 recommendation overridden. Consequences handled: `SUPABASE_SERVICE_ROLE_KEY` + `GLM_API_KEY`/`GEMINI_API_KEY` + `MW_KMS_MASTER_KEY` become **Wrangler secrets**; agent job driver is client-poll-driven (same pattern as the report page's advance loop) |
| 4 | Master key location | **Function env secret** | `MW_KMS_MASTER_KEY` as a Worker secret — key material stays outside the DB |
| 5 | Action quotas | **Starter 10 / Pro 30 per month; 1 PR (any number of fixes) = 1 action** | `plans.actions_per_period` column; free/one-time = preview only |
| 6 | Agent LLM budget | **Reuse GLM** via `llm_models` routing + `agent:llm:*` budget keys | API key must be mirrored as a Worker secret; budget via `consume_budget` RPC |
| 7 | Purge git history | **Decide later** (before first push) | Reminder stands: run §4.3.4 before adding any remote |
| 8 | Diagnostic-results redesign | **Dropped** | Removed from backlog per user decision |

Original questions (superseded by the table above): rotation gate; GitHub App creation; broker placement; master key location; action quotas; LLM budget; history purge; backlog scheduling.

---

## Appendix A — Verification evidence (2026-09-29)

- Deployed functions + verify_jwt + timestamps: Management API `GET /projects/{ref}/functions`.
- RLS/policies/grants/scale: SQL via Management API (`pg_class.relrowsecurity`, `pg_policies`, `information_schema.role_table_grants`, `pg_stat_user_tables`).
- pg_cron: `cron.job` → `sweep-jobs`, `* * * * *`, `net.http_post(... '/sweeper', x-cron-secret: vault_secret('cron_secret'))`.
- Vault: `vault.secrets` names (2); `vault_secret()` def = `SECURITY DEFINER`, EXECUTE granted to `postgres`/`service_role` only.
- Function-generation drift: fresh `GET /functions/{slug}/body` for advance-analysis (21,173,317 B: GLM 12, Gemini 12, topUpCompetitorPicks 4, blendSeoScore 4, HTTPS/og:image/favicon present, OpenRouter 0), polar-webhook (817,815 B: order.paid 10, report_credits 6, dual whsec_ derivation), start-analysis (14,407,136 B: credits + self-heal + CORS allowlist), sweeper (8,171,177 B: reconcilePolarSubscriptions), free-audit (14,025,234 B). Bodies saved under `scratch/live-fns/` (gitignored).
- Code reads: `src/lib/{config,supabase,session,data,api,steps,report-types,track,format}.ts`, `src/app/app/**`, `src/components/{agent-console,report-viewer,free-audit-form,pricing-cards}.tsx`, `fnsrc/*` (all generations), `wrangler.jsonc`, `open-next.config.ts`, `next.config.ts`, deploy scripts, `scripts/pipeline_tests/*`.
- Committed-secrets scan: worktree grep + `git log --all` content scan (48 commits, no remote) + `.gitignore` review.
