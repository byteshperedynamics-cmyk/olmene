# olmene.com — Domain → GitHub Repo → Worker Connection

Everything needed to connect **olmene.com** (purchased on Cloudflare, zone
already active) to **github.com/byteshperedynamics-cmyk/olmene** (private) via
a **new Cloudflare Worker** with push-to-deploy builds.

## What "connected" means here

```
push to main ──▶ Workers Builds (CI) ──▶ Worker "olmene" ◀── custom domains
                  (from the GitHub repo)      │            olmene.com
                                              │            www.olmene.com
                                    placeholder serves the
                                    domain until first build
```

1. **New Worker `olmene`** — created from `olmene/` scaffold in this repo.
   Serves a clean placeholder page (marked by the `x-olmene-placeholder: 1`
   response header) so the domain is live from minute one.
2. **Workers Builds** — the GitHub repo is connected so every push to `main`
   builds and redeploys the Worker automatically.
3. **Custom domains** — `olmene.com` and `www.olmene.com` route to the Worker.

## Automated path (preferred)

Two auth styles are supported:

- **API token**: `export CLOUDFLARE_API_TOKEN=cfat_...` (scoped token; preferred)
- **Global API Key**: `export CLOUDFLARE_API_KEY=cfk_... CLOUDFLARE_EMAIL=you@example.com`
  (the `cfk_` prefix key — full account access, sent as `X-Auth-Key`/`X-Auth-Email`)

An API token needs these permissions:

| Permission | Scope | Used for |
|---|---|---|
| Account Settings: Read | Account | find the account |
| Zone: Read | Zone (olmene.com) | find the zone |
| DNS: Edit | Zone (olmene.com) | clear conflicting A/AAAA/CNAME on attach |
| Workers Scripts: Edit | Account | create + deploy the Worker |
| Workers Builds: Edit | Account | repo connection, build config, hooks |
| Workers Domain Settings / Routes: Edit | Account + Zone | attach custom domains |

Run:

```bash
python3 scripts/olmene/connect.py all
```

`all` runs: deploy placeholder → connect repo → attach domains → trigger first
build (via deploy hook, no push needed) → verify live over HTTPS.

Fine-grained resume after any interruption:

```bash
python3 scripts/olmene/connect.py status             # current state of everything
python3 scripts/olmene/connect.py deploy-placeholder # just the Worker
python3 scripts/olmene/connect.py connect-repo       # repo + build config + hook
python3 scripts/olmene/connect.py attach-domains     # olmene.com + www
python3 scripts/olmene/connect.py trigger-build      # fire hook + poll build
python3 scripts/olmene/connect.py verify             # live HTTPS checks
```

State persists in `scratch/olmene_state.json` (gitignored). The token is only
read from env / `--token-file` and sent in the Authorization header — it is
never logged or written to disk.

## The one interactive step (maybe)

Connecting a repo requires the **Cloudflare GitHub App** to be installed on the
`byteshperedynamics-cmyk` GitHub account with access to the `olmene` repo.

- If you have ever used Workers & Pages → "Connect to Git" on this account,
  the App is already installed and everything is fully automated.
- If not, `connect-repo` detects it and prints exact instructions (dashboard →
  Create application → Import a repository → authorize on GitHub). 30 seconds,
  one time; then re-run `connect-repo` and continue.

## Adaptive build commands

If the repo already contains its own `wrangler.toml` / `wrangler.jsonc`, it is
used as-is (respects an existing Worker project). Otherwise the build config
generates one at build time:

- **build**: `if test -f package.json; then npm run build --if-present; fi`
  — runs only when a build script exists; never fails on static-only repos.
- **deploy**: computes the static output directory (`dist` → `build` → `out` →
  `public` → repo root), writes a minimal assets-based `wrangler.jsonc`, and
  runs `npx wrangler deploy`.

When the Cloudflare API's `config_autofill` for the repo is reachable, its
suggestions take precedence over these defaults.

## Manual dashboard path (alternative, no API token)

1. **Workers & Pages → Create → Worker** → name it `olmene` → Deploy.
2. **Overview → Connect to Git** (or create via "Import a repository") →
   authorize the Cloudflare GitHub App → pick `byteshperedynamics-cmyk/olmene`
   → branch `main` → Save.
3. **Settings → Domains & Routes → Add → Custom domain** → `olmene.com`; repeat
   for `www.olmene.com` (confirm the DNS record change when prompted).

## After setup

- Every push to `main` on the repo deploys automatically (builds visible under
  the Worker → Builds tab; logs retrievable via the API too).
- Build commands can be tuned any time: dashboard (Worker → Settings → Build)
  or `PATCH /accounts/{account_id}/builds/workers/{script_tag}`.
- Both `olmene.com` and `www.olmene.com` serve the Worker. If you want one
  canonical host (e.g. `www` → apex redirect), add a Redirect Rule in the zone
  once the site is live — deliberately not set up beforehand.
