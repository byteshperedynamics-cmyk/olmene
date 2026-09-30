# archive/ — historical working artifacts

Nothing in this directory is needed to build, run or deploy the app (the
build only reads the repo root, `src/`, `public/` and the config files).
These are kept for archaeology, audits and benchmarks.

| Path | What it is |
|---|---|
| `artifacts/` | Screenshots from manual i18n QA passes (Arabic, Urdu, Chinese …) |
| `assets/` | Design working files + JSON analyses of logo/hero/loading animations |
| `db/` | `custom.db` — vestigial SQLite from the scaffold era (never used in prod) |
| `examples/` | A WebSocket example kept during development |
| `fnsrc/` | **Three generations of Supabase Edge Function source** — the bundles (`sa_index.ts`, `advance-analysis-gemini.ts`, `polar-webhook-bundle.ts` …) match what is deployed. Consolidating these into `supabase/functions/` is roadmap item G11 |
| `jschunks/` | Downloaded JS chunks from the deployed site, used for bundle debugging |
| `mini-services/` | Empty scaffold from the old hosting platform |
| `placeholder-worker/` | The original `olmene` placeholder landing-page worker (served olmene.com before the app moved in; also the genesis of this repo) |
| `qa/` | Lighthouse reports + Playwright screenshots (41 MB — the heavy stuff) |
| `reports/` | Report fixtures (`real_report_data.json`, sample), Polar review reply draft |
| `research/` | Raw HTML/JSON captures of provider docs (Cloudflare pricing, Gemini limits, Polar API …) |
| `scratch/` | Ad-hoc working files (screenshots, audit outputs, gh-export staging) |
| `zscripts/` | Start/build scripts from the previous hosting platform |
| `Caddyfile` | Local reverse-proxy config used during development |
| `deno.lock` | Lockfile from edge-function experiments (see `fnsrc/`) |
