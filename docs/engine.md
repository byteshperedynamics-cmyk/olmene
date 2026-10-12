# Olmene engine — how it runs (engine v1, 2026-10-13)

The engine is everything behind the screens: the free scan, the report pipeline, the fix agent, re-checks, monitoring, notifications and the background jobs. UI lives elsewhere (see the workspace `COORDINATION.md`).

## Moving parts

| Piece | Where | Driven by |
|---|---|---|
| Free scan (21 scored checks + platform + extra checks), saved as `scans` | `supabase/functions/free-audit` | browser POST; monitoring (cron secret) |
| Report pipeline (11 steps) | `supabase/functions/advance-analysis` | **itself**: each finished step queues the next (`background: true`, `EdgeRuntime.waitUntil`); `start-analysis` kicks the first; `sweeper` (pg_cron, every minute) is the safety net. An open tab also helps but is never needed. |
| Fix runs (plan → preview → approval → PR → verify) | `src/lib/agent/*`, `/api/agent/*` (Worker) | `/api/cron/agent/` (pg_cron, every 20 s) + a kick after create/approve (`after()`), atomic lease |
| PR merge tracking, live re-checks, preview checks, Impact sync | `/api/cron/sync/` (Worker) | pg_cron every 10 min |
| Weekly monitoring + competitor watch + digests | `supabase/functions/monitor` | pg_cron every 10 min (small batches) |
| Customer emails (outbox) | `supabase/functions/notify` | pg_cron every minute |
| Uptime + error alerts | `supabase/functions/health-watch` | pg_cron every 5 min |

Free fix preview: `POST /api/agent/jobs { scanId, targetRepo }` plans from a saved scan (lite report: checklist + homepage text) instead of a full report. 3 per user per day; applying stays paid (approve route).

## Releasing this version (order matters)

1. **Production is running a broken laptop build** (2026-10-12, Next 16.4.0). Restore first:
   ```bash
   npx wrangler rollback bf1c1d70-c786-4033-b7b1-ea3b392f8ffe --message "Roll back broken local build"
   npm run smoke   # every line ✓
   ```
2. **Deploy the edge functions** (they tolerate the new tables not existing yet):
   ```bash
   for f in free-audit advance-analysis start-analysis sweeper notify monitor health-watch; do
     npx supabase functions deploy $f --project-ref ffoevhldpppyfsfgufmx --no-verify-jwt
   done
   ```
   Later: add `SUPABASE_ACCESS_TOKEN` as a GitHub repository secret and `.github/workflows/deploy-functions.yml` does this on every main push.
3. **Merge to main.** Workers Builds runs `npm ci`, the OpenNext build, `supabase db push` (migration `20261017_engine_v1`) and `wrangler deploy` — which now refuses a bundle that would crash at startup or carries local env values (`scripts/verify-worker-build.mjs`).
4. `npm run smoke` again.

Never `npm run deploy:cf` from a laptop (it refuses unless `OLMENE_ALLOW_LOCAL_DEPLOY=1`, and checks installed == locked versions).

## Switches (all optional; each turns one feature on)

| Secret | Set on | Turns on |
|---|---|---|
| `BREVO_API_KEY`, `NOTIFY_FROM_EMAIL` (verified sender), `NOTIFY_FROM_NAME` | edge functions | customer emails (`notify`) and alert emails (`health-watch`) |
| `ALERT_EMAIL` | edge functions | operator alerts: failing API routes, new errors (max every 30 min) |
| `CF_ACCOUNT_ID`, `CF_BROWSER_TOKEN` (Browser Rendering – Edit) | edge functions | rendering JavaScript-built sites in the free scan and the crawl (10 browser-hours/month on Workers Paid, then $0.09/h) |
| `CRUX_API_KEY` (Google Cloud, Chrome UX Report API) | edge functions | real-user Core Web Vitals in the free scan |
| `MISTRAL_API_KEY` | edge functions **and** Worker | EU AI fallback when both Vertex models fail (row `mistral/mistral-medium-latest`). Add Mistral to the privacy processor list first. |
| `TAVILY_MONTHLY_CAP` | edge functions | raise it after moving Tavily to a paid / pay-as-you-go plan (default 950 = free tier) |
| GitHub App permission **Deployments: read** | GitHub → app settings | fix PRs checked on their preview deployment before merge (`step_outputs.previewCheck`). Update `/security` copy when you add it. |
| `SUPABASE_ACCESS_TOKEN` | GitHub repo secret | automatic edge-function deploys from main |

## Where to look

```sql
-- Cost per report (AI tokens × model price + research credits + renders)
select * from engine_cost_by_job order by started_at desc limit 20;
-- Cost per day by source/kind
select * from engine_cost_daily order by day desc limit 30;
-- Recent problems (also mailed by health-watch when ALERT_EMAIL is set)
select created_at, source, severity, message from ops_events order by created_at desc limit 50;
-- Emails waiting / sent / skipped
select status, kind, count(*) from notifications group by 1, 2;
-- Monitored sites
select host, last_score, last_scan_at, next_scan_at from sites order by next_scan_at;
```

Model prices for the cost views live in `llm_models` (`input_usd_per_mtok`, `output_usd_per_mtok`, `cached_input_usd_per_mtok`) — update them when Google or Mistral change prices.

## Tests

```bash
npm test                                   # app + agent + measure (bun)
deno test --allow-all supabase/functions   # free scan, pipeline, parity, monitor, notify
npx opennextjs-cloudflare build && node scripts/verify-worker-build.mjs
```

`supabase/functions/advance-analysis/parity.test.ts` keeps the free scan's and the pipeline's copies of the 21 checks identical; if it fails, a change was made to one copy only.
