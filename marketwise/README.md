# Marketwise — Frontend

The Marketwise marketing site & app: outcome-first landing page with a **free instant diagnosis**,
full pricing, sample report, magic-link auth, dashboard, live analysis progress and the full report
viewer (scores, cited market view, competitors, audit, strategy, 7/30/60/90-day roadmap, sources).

Wired to the existing backend (no backend changes required):

| What | Where |
| --- | --- |
| Supabase project | `https://ffoevhldpppyfsfgufmx.supabase.co` (publishable key baked into `src/lib/config.ts` defaults) |
| Edge functions used | `start-analysis`, `advance-analysis`, `create-checkout`, `create-portal-session`, `free-audit` (new) |
| Tables read (RLS) | `plans`, `subscriptions`, `analysis_jobs`, `reports` |
| Payments | Polar (merchant of record) |

## Local development

```bash
bun install        # or: npm install
bun run dev        # http://localhost:3000
```

Environment (optional — defaults already point at production backend):

```
NEXT_PUBLIC_SUPABASE_URL=https://ffoevhldpppyfsfgufmx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_APP_URL=https://get.marketwiselabs.workers.dev
```

## Deploy to Cloudflare Workers (replaces the live site)

One-time:

```bash
npm install -g wrangler   # if not installed
wrangler login            # opens browser; use the Cloudflare account that owns `get`
```

Then:

```bash
npm install
npm run deploy:cf         # = opennextjs-cloudflare build && opennextjs-cloudflare deploy
```

This builds with OpenNext for Cloudflare and deploys to the **`get` worker**
(`get.marketwiselabs.workers.dev`). The worker name is set in `wrangler.jsonc` —
keep it as `get` so the URL doesn't change.

To preview locally on Workers runtime before deploying:

```bash
npm run preview:cf
```

### Deploying with an API token instead of login

```bash
CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<account-id> npm run deploy:cf
```

The token needs: Workers Scripts (Edit), Account Settings (Read).

## What's new vs the previous site (marketing-driven)

1. **Outcome-first hero** — "Know exactly what to fix to get more customers." with the URL field +
   free diagnosis front and center (the report's #1 recommendation), trust line under the CTA.
2. **Free instant diagnosis** — new `free-audit` edge function (deterministic, no LLM cost,
   rate-limited 8/hour/IP) + hero form + results card with scores, findings and the paywall step
   ("Unlock my full 90-day strategy").
3. **Pricing presentation** — plans read live from the DB (Starter: 2 analyses/mo, Pro: 4 analyses/mo),
   psychological reframe ("Less than one hour with a marketing consultant"), risk-reversal block,
   Polar as merchant of record.
4. **Proof & trust sections** — trust cards (live research / real website audit / cited evidence /
   prioritized actions), "anti-generic advice" comparison (vs ChatGPT, templates, consultants),
   methodology strip ("AI research. Evidence you can check.") instead of an apologetic disclaimer.
5. **Sales-oriented FAQ** — "Is this just ChatGPT?", accuracy/sources, retention cadence, cancellation.
6. **Professional design system** — editorial serif display + Inter, emerald accent, refined light/dark
   themes, consistent section rhythm, print-ready report layout, accessible + responsive.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing (hero + free diagnosis, how it works, what's inside, aha demo, trust, comparison, teaser, pricing, FAQ, methodology, CTA) |
| `/pricing/` | Full pricing + risk reversal |
| `/sample-report/` | Full fictional sample report (all 9 tabs, export/print/copy) |
| `/login/` | Magic-link sign-in |
| `/app/` | Dashboard: quota, jobs, statuses |
| `/app/new/` | Start an analysis (URL, product, market, goal, language, competitors) |
| `/app/report/?id=<jobId>` | Live 10-step progress + full report |
| `/app/billing/` | Current plan, portal, plan switch |
| `/legal/terms/` · `/legal/privacy/` | Legal |
