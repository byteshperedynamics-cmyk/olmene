# Olmene engine — how it runs (engine v2, 2026-10-13)

The engine is everything behind the screens: the free scan, the report pipeline, the fix agent, guided fixes and platform connections, re-checks, monitoring, AI visibility, pull-request checks, notifications and the background jobs. UI lives elsewhere (see the workspace `COORDINATION.md`).

## Moving parts

| Piece | Where | Driven by |
|---|---|---|
| Free scan: 21 scored checks + platform (with fix modes) + kind of business + unscored extra and Business checks + search/link-card preview data, saved as `scans` | `supabase/functions/free-audit` | browser POST (JSON, or NDJSON stream with `stream: true`); monitoring (cron secret) |
| Scan screenshot with pins (`scans.shot`, bucket `scan-shots`) | `free-audit/shot.ts` | after the scan answers (background), when Cloudflare Browser Rendering is configured |
| Proposed fixes for a scan (`scans.proposals`) | `free-audit/proposals.ts` | POST `{ scanId, action: "proposals" }`, once per scan |
| Report pipeline (11 steps) | `supabase/functions/advance-analysis` | itself (each step queues the next); `start-analysis` kicks the first; `sweeper` every minute is the safety net |
| Fix runs (plan → preview → approval → PR → verify) | `src/lib/agent/*`, `/api/agent/jobs*` | `/api/cron/agent/` every 20 s + a kick after create/approve |
| Guided fixes (any platform, no repo): values + platform steps + live checks | `src/lib/agent/guided/*`, `/api/agent/guided*` | user requests; `/api/cron/sync/` re-checks daily for 30 days |
| Webflow / WordPress connections (apply approved guided fixes, undo) | `src/lib/agent/channels/*`, `/api/agent/connect/{webflow,wordpress}`, `/api/agent/guided/[id]/{auto,apply,revert}` | user requests |
| PR merge tracking, live re-checks, preview checks, Impact sync | `/api/cron/sync/` | pg_cron every 10 min |
| Olmene checks on every pull request | `src/lib/agent/pr-checks.ts`, `/api/agent/pr-checks` | `/api/cron/sync/` (5 repos × 5 PRs per run) |
| Weekly monitoring + competitor watch + digests + AI visibility | `supabase/functions/monitor` | pg_cron every 10 min (small batches) |
| Customer emails + Slack / Discord / webhook alerts (outbox) | `supabase/functions/notify` | pg_cron every minute |
| Uptime + error alerts, canary, automatic rollback, screenshot cleanup | `supabase/functions/health-watch` | pg_cron every 5 min |
| Browser errors | `/api/ops/client-error` → `ops_events` (source `browser`) | the UI's error reporter |

Fixable repositories (pull requests): static HTML, Next.js App Router and Pages Router, Astro, Nuxt (`nuxt.config` head defaults), SvelteKit (`src/app.html`), Angular (`src/index.html`), Vue CLI and Vite / Create React App (head of the HTML shell). Hugo, Jekyll and Eleventy repositories are refused with a guided-fix reason. Everything else (WordPress, Shopify, Wix, Squarespace, Webflow, Framer, Ghost, HubSpot, Duda, GoDaddy, Square Online, BigCommerce, Jimdo, Carrd, Tilda, Drupal, Joomla, Magento, PrestaShop, Bubble…) gets guided fixes; Webflow and WordPress can also apply some of them through their APIs.

## Releasing this version (order matters)

1. **Deploy the edge functions** (they tolerate the new tables not existing yet):
   ```bash
   for f in free-audit advance-analysis start-analysis sweeper notify monitor health-watch; do
     npx supabase functions deploy $f --project-ref ffoevhldpppyfsfgufmx --no-verify-jwt
   done
   ```
   Or add `SUPABASE_ACCESS_TOKEN` as a GitHub secret: `.github/workflows/deploy-functions.yml` then deploys them on every main push.
2. **Switch the Worker deploy to the gated deploy**: Cloudflare dashboard → Workers → olmene → Settings → Build → Deploy command: `npm run deploy:gated`. The new version gets no traffic until `scripts/smoke.mjs` passes against it (version-override header); a failure keeps the current version and fails the build.
3. **Merge to main** (`redesign/v2` once GLM has merged `engine/v2`). Workers Builds runs `npm ci`, the OpenNext build, `supabase db push` (migrations `20261017_engine_v1`, `20261020_engine_v2`) and the deploy.
4. `npm run smoke`.

Never deploy from a laptop (`deploy:cf` and `deploy:gated` both refuse outside CI).

## Switches (all optional; each turns one feature on)

| Secret / setting | Set on | Turns on |
|---|---|---|
| `BREVO_API_KEY`, `NOTIFY_FROM_EMAIL`, `NOTIFY_FROM_NAME` | edge functions | customer emails and alert emails (Slack/Discord/webhook alerts work without them) |
| `ALERT_EMAIL` | edge functions | operator alerts: failing API routes, new errors, canary problems (max every 30 min) |
| `CF_ACCOUNT_ID`, `CF_BROWSER_TOKEN` (Browser Rendering – Edit) | edge functions | JS-site rendering in scans and reports, and the scan screenshot with pins (~10 browser-seconds per scan; 10 h/month on Workers Paid, then $0.09/h) |
| `CRUX_API_KEY` | edge functions | real-user Core Web Vitals in the free scan |
| `PSI_API_KEY` (or the CRUX key with the PageSpeed Insights API enabled) | edge functions | mobile lab speed in reports (`meta.speed`) |
| `MISTRAL_API_KEY` | edge functions **and** Worker | EU AI fallback (add Mistral to the privacy processor list first) |
| `TAVILY_MONTHLY_CAP` | edge functions | raise after moving Tavily to a paid plan (default 950) |
| `AI_VISIBILITY=1` (+ optional `AI_VISIBILITY_PROMPTS`, default 6; `AI_VISIBILITY_MODEL`) | edge functions | weekly AI search visibility for paid sites (Gemini on Vertex with Google Search grounding; billed per grounded request — check the current Vertex price before turning on) |
| `LLM_SCHEMA_IN_PROMPT=1` | edge functions | restores the old prompts (schema repeated in the system prompt) if report quality drops |
| `LLM_STEP_MODELS` (JSON, step → active model id) | edge functions | a cheaper model for chosen steps — only after `npm run eval:reports` shows no drop |
| `REPORT_COST_CAP_USD` | edge functions | soft per-report cost cap (optional copy step skipped past it) |
| `AUTO_ROLLBACK=1`, `CF_DEPLOY_TOKEN` (Workers Scripts – Edit), `CF_ACCOUNT_ID`, optional `CF_WORKER_NAME` | edge functions | health-watch rolls back to the previous version when the API routes fail twice in a row within 3 h of a deploy |
| `MW_KMS_MASTER_KEY` (already set) | Worker | also encrypts Webflow tokens and WordPress application passwords |
| GitHub App permissions **Deployments: read**, **Checks: write** | GitHub → app settings | preview checks on fix PRs; Olmene checks on every PR. Update `/security` copy when added. |
| `SUPABASE_ACCESS_TOKEN` | GitHub repo secret | automatic edge-function deploys from main |

## Where to look

```sql
-- Cost per report / per day
select * from engine_cost_by_job order by started_at desc limit 20;
select * from engine_cost_daily order by day desc limit 30;
-- Prompt caching at work (cached share of prompt tokens per step, last 7 days)
select step, sum(cached_tokens)::float / nullif(sum(prompt_tokens), 0) as cached_share
  from engine_usage where kind = 'llm' and created_at > now() - interval '7 days' group by 1 order by 1;
-- Recent problems (also mailed by health-watch when ALERT_EMAIL is set)
select created_at, source, severity, message from ops_events order by created_at desc limit 50;
-- Browser errors
select created_at, message, detail->>'path' from ops_events where source = 'browser' order by created_at desc limit 30;
-- Emails and alerts
select status, kind, count(*) from notifications group by 1, 2;
select kind, active, failures, last_error from alert_channels;
-- Guided fixes: how many go live
select platform_id, count(*), avg(live_count::float / nullif(total_count, 0)) from guided_runs group by 1;
-- AI visibility trend per site
select s.host, r.checked_at, r.mention_share, r.cite_share from ai_visibility_runs r join sites s on s.id = r.site_id order by r.checked_at desc limit 20;
-- PR checks
select repo, pr_number, conclusion, regressions, created_at from pr_checks order by created_at desc limit 20;
```

## Quality

```bash
npm run eval:reports -- --db --limit 20     # score the latest production reports (read-only; needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
npm run eval:reports -- --dir ./reports --min 75
```
Run it before and after any prompt or model change (`LLM_STEP_MODELS`, `LLM_SCHEMA_IN_PROMPT`). Reports also carry `meta.quality` (market claims whose numbers were checked against their cited sources).

## Tests

```bash
npm test                                   # app + agent + measure (bun)
deno test --allow-all --config supabase/functions/deno.json supabase/functions   # scan, pipeline, parity, monitor, notify, health-watch
npm run check:rls                          # every table has row level security
npx opennextjs-cloudflare build && node scripts/verify-worker-build.mjs
```

`supabase/functions/advance-analysis/parity.test.ts` keeps the free scan's and the pipeline's copies of the 21 checks identical.
