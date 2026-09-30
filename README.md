# olmene

This repository serves two purposes:

1. **olmene.com Worker** (repo root) — deployed automatically by Cloudflare
   Workers Builds on every push to `main`. Serves olmene.com + www.olmene.com.
   Code: `src/index.js`, config: `wrangler.jsonc`.

2. **`marketwise/`** — the complete MarketWise source code snapshot
   (Next.js 16 app, agent system, Supabase migrations, edge function sources,
   docs, reports, research, QA artifacts). Not deployed; reference copy.
   See `marketwise/README.md` for details.
