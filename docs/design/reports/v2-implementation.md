# Olmene v2 — Implementation report (phases 1–5)

Branch: `redesign/v2` (local worktree `../olmene-v2`, based on `main` at `1cbd1a5`).
Nothing is pushed or deployed. Every push to `main` deploys and runs `supabase db push`, so review the migrations list below before merging.

## What shipped

| Phase | Commit | Summary |
|---|---|---|
| 1 Foundation | `93f9801` | Instrument tokens (deeper warm dark, surface-2, faint, line-strong, leaf-soft, glow, amber, diff tints, grid), motion tokens + `o-*` keyframes, off-screen loop pausing, reduced-motion stops; `src/components/v2/*` (Flower, pills, CountUp, ScanPreview, StepRail, DiffView, KpiTile, ImpactChart, MetricBars, MergeRing, FixFeed, ConnectDiagram, ProductFrame); Button `sheen`/`hairline`; `/dev/components` |
| 2 Homepage | `4208a45` | New section order and positioning, scan-preview hero, agent review showcase, teardown, can/cannot, comparison, pricing band, FAQ, final CTA; free-audit form split into provider/input/result (API unchanged); 85 strings × 15 languages; script-aware fonts for ar/ur/hi/bn/zh/ja |
| 2 Pricing | `1593be4` | Plan grid priced on fixes; renders today's plans now and Fix/Team automatically once their rows exist; additive `plans` columns; pending rows migration |
| 3 Agent screens | `d4a20a4` | Fix-run page (rail, change cards, diff, evidence, undo, sticky approve bar, all states), hub, `/app/connect`, `/dev/agent-run` |
| 3 Framework fixers | `0015a14` | **Security fix**: every file of every action is validated (was first file only). Next.js App Router + Astro support with a strict metadata scanner; exact framework edit paths |
| 3 Merge tracking | `5fe8cb6` | PR state on `agent_jobs`, GET-only sync, `POST /api/cron/sync/` (secret-gated) |
| 4 Measure | `c3cf4fe` | Attribution math (tested), Google OAuth (read-only, encrypted refresh token), GSC sync, `/app/impact`, `/dev/impact` — behind flags |
| 5 Open metrics | `b648b10` | `public_stats()` aggregates, `/api/public/stats/`, live proof strip + hero count, `/open`, `/dev/open` |

## Verification (final)

- TypeScript: 0 errors (baseline 0). Production build `npm run build:cf`: passes (type-gated).
- ESLint `src/`: 0 errors, 1 pre-existing warning (baseline identical).
- Tests: **91 pass / 0 fail** (`npm test`; baseline 58). New: jsfile editor, framework end-to-end runs, path policy, PR sync, Google token redaction, attribution statistics, Measure sync.
- i18n: `node scripts/i18n_validate.js` 28/28.
- Visual QA in the browser: 1440 and 390 widths, light and dark, Arabic (RTL), German; no horizontal page scroll; every agent/impact state via the `/dev/*` previews.
- Lighthouse (mobile, both builds served locally with `wrangler dev`, same machine): see the table at the end.

## Database changes

Applied automatically when the branch merges (`supabase/migrations/`, all additive and idempotent):

1. `20261002_plans_v2_columns.sql` — slug, billing_interval, monthly_equivalent_eur, sites_limit, features_key; backfill of Starter/Pro/Single Report.
2. `20261003_pr_tracking.sql` — PR columns on `agent_jobs` + backfill from `step_outputs`.
3. `20261004_measure.sql` — `gsc_daily`, `fix_outcomes` (RLS select-own), `connections` provider check widened to include `google`.
4. `20261005_public_stats.sql` — `public_stats()`, `current_mrr_eur()`, `metrics_weekly` + weekly pg_cron snapshot, `connections.public_feed_opt_in`.
5. `20261010_plans_v2_rows.sql` — Fix/Team/€29 plans on the new Polar products; old plans deactivated.

Waiting for you (`supabase/pending/`, NOT applied):

- `cron_sync.sql` — 15-minute sync schedule (needs the cron secret).

## Human actions needed

1. **Review and merge** `redesign/v2`. I could not push: the remote requires credentials this environment doesn't have. From the main checkout:
   `git push origin redesign/v2`, then open a PR.
2. **Polar (new account "ByteSphere_Dynamics", done 2026-10-02):** default currency switched to EUR; products created (Fix €49/mo + €468/yr, Team €149/mo + €1,428/yr, Single report €29); webhook `2f566328…` → `polar-webhook` for order.* and subscription.* events; one-use 100%-off code for the end-to-end test (single report only, expires 2026-10-15). `supabase/migrations/20261010_plans_v2_rows.sql` points the plans at the new products and deactivates Starter/Pro/€14. **Still yours:** set the Supabase function secrets `POLAR_SERVER=production`, `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET` (values in `.dev.vars`) right after merging, and finish Polar's account review/payout setup.
3. **Cron secret**: `openssl rand -base64 48`; `npx wrangler secret put OLMENE_CRON_SECRET`; store the same value in Supabase Vault as `olmene_cron_secret`; move `supabase/pending/cron_sync.sql` into migrations.
4. **Google OAuth client** (for Measure): Google Cloud project → OAuth consent screen (scope `webmasters.readonly`) → Web client with redirect URI `https://olmene.com/api/measure/google/callback/`. Then `wrangler secret put GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Enable with `MEASURE_FEATURE_ENABLED=true` (Worker) and `NEXT_PUBLIC_FEATURE_MEASURE=true` (`.env.production`).
5. **Agent in production** (when ready): `AGENT_FEATURE_ENABLED` + `NEXT_PUBLIC_FEATURE_AGENT=true`, register the GitHub App, run a real-repo end-to-end on a Next.js test site.
6. **Public revenue**: `/open` hides MRR unless `PUBLIC_METRICS_SHOW_MRR=true` on the Worker.
7. **Native review** of the new strings (keys: `hero.*`, `scan.*`, `loop.*`, `review.*`, `agent.step.*`, `cc.*`, `compare.*`, `ph.*`, `gh.*`, `cta.*`, `faq.q1–a6`, `meta.*.home`, `meta.desc.pricing`, `footer.tagline`, `footer.motto`, `pricing.body`, `pc.*`, `plan.*`, `stats.fixes`). They were machine-translated by me.
8. **Demo video**: still hidden (`SHOW_DEMO=false`) until it's re-recorded with the new brand.

## Deviations from the brief

- The app area (`/app/**`) stays English — it had no i18n before; translating it is a separate task. `/open` is English for now.
- The Connect screen is a shared panel used by the hub (when GitHub isn't connected) and `/app/connect`; Search Console connects from the Impact page and appears as the third node when Measure is on.
- Framework image-alt and pricing-link fixes skip with an explicit reason (they live in component code); JSX attribute editing was out of scope for safety.
- No TypeScript compiler in the fixer (too large for the Worker bundle): a strict scanner that refuses anything unusual, with every edit re-parsed.
- Hero LCP is the H1 (as designed); its timing depends on the display webfont.

## Lighthouse (mobile, local builds)

Both builds served locally with `wrangler dev` on the same machine (raw data: `docs/design/perf-v2.json`). Local numbers are not comparable to the live-site baseline in `perf-baseline.json` (that one includes real network latency).

| Page | Build | Performance | Accessibility | Best practices | SEO | LCP | TBT | Transfer |
|---|---|---|---|---|---|---|---|---|
| Home | main (4 runs) | 83–90 | 100 | 100 | 100 | 3.6–4.4 s | 90–141 ms | 645 KB |
| Home | v2 (3 runs) | 82–83 (83–86 in earlier runs) | 100 | 100 | 100 | 4.3 s | 114–169 ms | 632 KB |
| Pricing | main | 86 | 98 | 100 | 100 | 4.1 s | 44 ms | 632 KB |
| Pricing | v2 | 84 | 98 → 100 after the heading fix | 100 | 100 | 4.4 s | 35 ms | 638 KB |

Median homepage performance is within ~2 points of main (brief budget: 3). Fixed during QA: diff line-number contrast in dark mode, the stats endpoint returning 5xx when the database is unreachable (now 200 + `unavailable`), pricing heading order.
