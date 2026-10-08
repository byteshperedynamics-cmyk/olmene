# Olmene

**Marketing diagnosis you can verify, and fixes you can ship.**

Formerly *Marketwise* — rebranded and moved to **olmene.com**. A founder enters
a URL and gets a free instant diagnosis (21 deterministic checks, no LLM cost),
then can buy a full cited report: crawl, live web research, competitor
analysis, a five-part audit and a 7/30/60/90-day plan. Every market claim
links to a source.

## Repository map

| Path | What it is |
|---|---|
| `src/` | Next.js 16 / React 19 app (Tailwind 4, shadcn/ui, 15-language i18n) |
| `supabase/` | SQL migrations (schema, pg_cron sweeper, seeds) |
| `prisma/` | Legacy Prisma schema (vestigial — the live schema is Supabase SQL) |
| `scripts/` | Ops & dev tooling (deploys, audits, snapshots, infra setup) |
| `public/` | Static assets (logo, robots, OG image, demo video) |
| `tests/` | Test suites (agent unit tests, pipeline tests) |
| `docs/` | Documentation: `worklog.md`, `architecture-audit.md`, `integrations.md`, `olmene-setup.md` |
| `workers/` | Auxiliary Cloudflare Workers (`get-redirect/` = 301s from the old workers.dev URL) |
| `video/` | Promo videos made with Remotion — the TikTok promo, its renders and its synthesized soundtrack (own `package.json`, not part of the app build; see `video/README.md`) |
| `archive/` | Historical working artifacts — see `archive/README.md` (nothing in `archive/` is needed to build or run the app) |

## Architecture

```
browser ─▶ olmene.com + www.olmene.com
              │  Cloudflare Worker "olmene" (this repo, OpenNext adapter)
              ▼
        Next.js 16 app (static + API routes)
              │                          │
              ▼                          ▼
   Supabase Postgres (RLS)     Supabase Edge Functions (8)
   profiles, reports, plans,   free-audit, start/advance-analysis,
   subscriptions, agent_*      polar-webhook, sweeper, …
              │                          │
              ▼                          ▼
        pg_cron sweeper          LLMs (Gemini direct + Z.ai GLM fallback),
        (job leases, 1-min)      Tavily research, Polar billing, Brevo email
```

- **Deploys**: every push to `main` → Cloudflare Workers Builds → Worker
  `olmene` (owns both custom domains). Build: `npx opennextjs-cloudflare
  build`, deploy: `npx wrangler deploy` (root `wrangler.jsonc`). Its
  `build.command` first copies the prerendered pages into the static assets,
  so pages are served from files instead of re-rendered per request.
- **Secrets** (worker): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `MW_KMS_MASTER_KEY`, `AGENT_FEATURE_ENABLED` — set once via
  `npx wrangler secret put <NAME>` or the API; they persist across deploys.
- **Secrets** (edge functions): set via Supabase Management API
  (`APP_URL=https://olmene.com`, `APP_NAME=Olmene`, model keys, Polar…).

## Develop

```bash
bun install            # or npm install (Node ≥ 22, see package.json engines)
cp .dev.vars.example .dev.vars   # optional: local worker secrets for preview
npm run dev            # http://localhost:3000

npm run build:cf       # production build via OpenNext (→ .open-next/)
npx wrangler dev       # preview the actual worker locally
```

`.env.production` (committed) holds the **public** build-time values
(Supabase URL + publishable key, app URL, GA id). Real secrets never live in
the repo.

## Test

```bash
npm run test:agent     # agent suite (bun test src/lib/agent)
npm run lint           # eslint
```

## Deploy — the one pipeline

Every push to `main` runs one CI pipeline (Cloudflare Workers Builds) that
syncs everything:

```
push to main
  └─ build:  npm ci
             npx opennextjs-cloudflare build     (app bundle → .open-next/)
             npx supabase db push                (applies pending SQL migrations,
                                                  no-ops when up to date)
  └─ deploy: npx wrangler deploy                (page cache → assets via build.command,
                                                  then Worker "olmene" → olmene.com + www)
```

~3–5 minutes end to end. The Supabase access token and project ref live as
encrypted environment variables in the Workers Builds config (dashboard:
Worker `olmene` → Settings → Build).

What syncs automatically vs. not:

| Change | Synced on push? |
|---|---|
| App code, pages, UI, i18n (`src/`, `public/`, configs) | ✅ deploys live |
| Database schema (`supabase/migrations/*.sql` — add new files, never edit applied ones) | ✅ applied before deploy |
| Edge functions (`supabase/functions/`, all 8 — see its README) | ⚠️ manual: `npx supabase functions deploy <name>` |
| Worker secrets (`wrangler secret` / API) and Supabase function secrets | ⚠️ manual by design — secrets never live in git |

Manual deploy fallback: `npm run deploy:cf` (needs `CLOUDFLARE_API_TOKEN` or
`CLOUDFLARE_API_KEY` + `CLOUDFLARE_EMAIL`). Operational details:
`docs/olmene-setup.md`, `docs/integrations.md`.
