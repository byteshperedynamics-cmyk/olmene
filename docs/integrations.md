# Provider Integrations — Verified Reference

**Rule (spec §1):** verify every endpoint, scope, and lifetime against current official docs *before* coding, and record the source URL here. Each provider section below lists exactly what was verified, when, and from where.

- **GitHub** — verified 2026-09-29 (Phase 1) — status: **verified, build started**
- Cloudflare — pending (Phase 3)
- Supabase (Management OAuth) — pending (Phase 4)

---

## 1. GitHub (Phase 1)

### 1.1 Verified facts (source: official docs + official OpenAPI spec)

Source URLs (all fetched 2026-09-29):
- OpenAPI spec (machine truth): `https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json` (815 paths)
- Manifest flow: `https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest`
- Setup URL: `https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url`
- Installation tokens: `https://docs.github.com/en/rest/apps/apps` + `https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app`
- User access tokens: `https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app`

| Fact | Value | Verified via |
|---|---|---|
| GitHub App manifest flow | `https://github.com/settings/apps/new?manifest=<urlencoded-json>`; GitHub redirects to `redirect_url` with a one-time `code` (valid **1 hour**) | manifest-flow doc |
| Manifest → app conversion | `POST /app-manifests/{code}/conversions` (unauthenticated, rate-limited) → 201 with app fields **plus `client_id`, `client_secret`, `webhook_secret`, `pem` (private key)** | OpenAPI `/app-manifests/{code}/conversions` |
| Manifest keys | `name`, `url` (required), `redirect_url`, `callback_urls` (≤10), `setup_url`, `description`, `public`, `default_events`, `default_permissions` (permission name → `read`\|`write`) | manifest-flow doc |
| App permissions we need | `contents: write` (repo contents, commits, branches, merges), `pull_requests: write` — both enum-confirmed in `app-permissions` schema. **Nothing else.** | OpenAPI `app-permissions` |
| App JWT auth | RS256 JWT (`GET /app` to verify), 10-min max lifetime | auth docs |
| Installation token | `POST /app/installations/{installation_id}/access_tokens` (JWT auth) → `{token, expires_at, permissions, repository_selection, repositories}`. **Expires 1 hour from creation.** Expired → 401 | installation-token doc |
| Installation token format | **2026-04-27 GitHub began staged rollout of stateless `ghs_APPID_JWT` format — NOT fixed length.** Redaction patterns must be `ghs_[A-Za-z0-9_]+`, never length-based | installation-token doc |
| Token scope restriction | The create-token call accepts `repositories`/`repository_ids`/`permissions` to **narrow** an installation token at mint time | OpenAPI body schema |
| User access token (web flow) | `GET https://github.com/login/oauth/authorize?client_id&redirect_uri&state` → `POST https://github.com/login/oauth/access_token` (client_id, client_secret, code, redirect_uri) → `access_token` (**8 h / 28800 s**), `refresh_token` (`ghr_`). We discard the token after one-time verification — never stored | user-access-token doc |
| Installation verification | `GET /user/installations` — "List app installations accessible to the user access token" → `{installations: [{id, account, repository_selection, permissions, …}]}` | OpenAPI `/user/installations` |
| Repo allowlist source | `GET /installation/repositories` (installation-token auth) → repos the install can touch | OpenAPI `/installation/repositories` |
| Spoofing warning (setup URL) | **"Bad actors can hit this URL with a spoofed installation_id… generate a user access token for the user who installed the app and check that the installation is associated with that user."** → our connect flow MUST verify via user token, never trust a raw `installation_id` | setup-URL doc |
| Write path (multi-file PR) | Git Data API: `POST /repos/{o}/{r}/git/blobs` (content+encoding) → `POST /git/trees` (tree items `{path, mode, type, sha, content}`, `base_tree`) → `POST /git/commits` (required `message`, `tree`, `parents`) → `POST /git/refs` (required `ref` `refs/heads/…`, `sha`) → `POST /repos/{o}/{r}/pulls` (required `head`, `base`) | OpenAPI schemas |
| Read path | `GET /repos/{o}/{r}/contents/{path}` (file + base64 content), `GET /repos/{o}/{r}/branches/{branch}`, `GET /repos/{o}/{r}/git/trees/{sha}?recursive=1` | OpenAPI |

### 1.2 Architecture (decisions recorded 2026-09-29, user-approved)

- **Access model**: GitHub App (not PAT). Server-to-server only via 1-hour installation tokens minted on demand, **cached in memory only, never persisted**. User-to-server token used **once** at connect time to verify installation ownership, then discarded.
- **Connect flow** (anti-spoof, per the docs warning):
  1. `POST /api/agent/connect/github` (MarketWise auth) → server stores `state` (nonce ↔ user_id, 10-min TTL) → returns GitHub authorize URL (no user scopes requested).
  2. User authorizes; if the app is not yet installed, GitHub's authorize page offers **Install & Authorize** in the same step.
  3. `GET /api/agent/github/callback?code&state` → server validates `state` → exchanges `code` for a user token → `GET /user/installations` → records the installations found **for that GitHub user** → user token discarded immediately.
  4. If one installation → connection linked. If several → user picks on the install page; linking re-verifies the picked id against the discovered list (spoofed ids can never enter).
- **Broker host**: Cloudflare Worker (Next.js API routes) — user decision 2026-09-29.
- **Secret storage**: GitHub App `pem` + `client_secret` are **envelope-encrypted in the DB** (`agent_app_config`, per-secret DEK); master key lives **only** in Worker env (`MW_KMS_MASTER_KEY`, Wrangler secret — outside the DB, satisfying spec §1). Installation tokens never touch the DB.
- **Least privilege (enforced in code)**: per-job allowlist = repos from `/installation/repositories` ∩ the repo the job targets; forbidden: all `DELETE` methods, force-push (`PUT /git/refs/{ref}` with `force`), writes to the default branch, branch deletion, anything outside `contents`/`pull_requests` surfaces. The allowlist validator is deterministic code + unit-tested; the LLM never gets a vote.
- **Write pattern**: branch `marketwise/fix-<jobId>-<short>` from the default-branch head → single commit with all approved file changes → one PR per job titled with finding refs, body containing evidence, per-fix diffs, revert steps, expected score change. Default branch is never pushed.
- **Revocation (disconnect)**: delete the connection row (we lose the ability to mint) + direct the user to GitHub → Settings → Applications to uninstall + **verify**: attempt to mint an installation token for that installation — success means still installed (report as "revocation unverified" with exact manual steps); 404/401 means dead (record proof in `revocations`).
- **Rate limits**: GitHub App installation requests share the app's budget (5,000/h baseline, higher for orgs); we mint max 1 token/5 min per installation (in-memory cache) and cap job actions.
- **Free vs paid**: free = plan + preview only (diffs); paid = apply, 1 action per PR (Starter 10/mo, Pro 30/mo — user decision 2026-09-29; plans table gets `actions_per_period`).

### 1.3 GitHub App registration (user action)

Two ways:

**A. One-click manifest flow (recommended)** — visit `/app/agent` (feature flag on) → "Register GitHub App" button → GitHub pre-filled form → Create. The app's `pem`/`client_secret` are captured automatically (encrypted) by our manifest-callback route. No copy-paste.

**B. Manual** — GitHub → Settings → Developer settings → GitHub Apps → New GitHub App, with:
- Homepage URL: `https://get.marketwiselabs.workers.dev`
- Callback URL: `https://get.marketwiselabs.workers.dev/api/agent/github/callback`
- Setup URL: `https://get.marketwiselabs.workers.dev/app/agent/install`
- **Permissions: Contents → Read & write; Pull requests → Read & write. No others. No webhooks, no user permissions.**
- Then paste App ID + private key + client secret into the admin form on `/app/agent` (stored encrypted).

Manifest used by flow A (generated at runtime from `APP_URL`):

```json
{
  "name": "MarketWise",
  "url": "https://get.marketwiselabs.workers.dev",
  "redirect_url": "https://get.marketwiselabs.workers.dev/api/agent/github/manifest-callback",
  "callback_urls": ["https://get.marketwiselabs.workers.dev/api/agent/github/callback"],
  "setup_url": "https://get.marketwiselabs.workers.dev/app/agent/install",
  "public": false,
  "default_events": [],
  "default_permissions": { "contents": "write", "pull_requests": "write" }
}
```

### 1.4 Endpoint inventory we call (runtime)

| Call | Auth | When |
|---|---|---|
| `GET /app` | App JWT | config sanity check |
| `GET /app/installations/{id}` | App JWT | connection health check, disconnect verification |
| `POST /app/installations/{id}/access_tokens` | App JWT | before each GitHub-touching step (cached ≤ its 1 h expiry) |
| `POST https://github.com/login/oauth/access_token` | client_id+secret | connect callback only (code → user token) |
| `GET /user/installations` | user token (8 h) | connect callback only — ownership verification |
| `GET /installation/repositories` | installation token | allowlist build (job start) |
| `GET /repos/{o}/{r}` | installation token | repo info + default branch |
| `GET /repos/{o}/{r}/git/trees/{sha}?recursive=1` | installation token | target-file detection |
| `GET /repos/{o}/{r}/contents/{path}?ref=` | installation token | preview (before/after) |
| `POST /repos/{o}/{r}/git/blobs` · `POST …/git/trees` · `POST …/git/commits` · `POST …/git/refs` | installation token | apply (approved only) |
| `POST /repos/{o}/{r}/pulls` | installation token | apply (approved only) |
| `GET /repos/{o}/{r}/pulls/{n}` | installation token | verify |

Anything not in this table is **deny-by-default** in the scoped client.

### 1.5 Deployment walkthrough (Phase 1)

Code ships **flagged off** (`AGENT_FEATURE_ENABLED` unset → every agent route returns 503, all UI entry points hidden).

One-time setup (operator):

```bash
# 1. Master key for envelope encryption (never in DB/repo):
bun run scripts/agent-setup.ts genkey          # prints a 32-byte base64url key
npx wrangler secret put MW_KMS_MASTER_KEY      # paste the key

# 2. Service-role key (same trust domain as the edge functions):
#    fetch from the Supabase dashboard → Settings → API, or:
curl -s -H "Authorization: Bearer $SUPABASE_PAT" \
  https://api.supabase.com/v1/projects/ffoevhldpppyfsfgufmx/api-keys
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put SUPABASE_URL           # https://ffoevhldpppyfsfgufmx.supabase.co

# 3. LLM keys for copy drafting (mirror of edge-function secrets):
npx wrangler secret put GLM_API_KEY
npx wrangler secret put GEMINI_API_KEY         # optional (google/* models)

# 4. Verify, deploy, then enable:
bun run scripts/agent-setup.ts check
CLOUDFLARE_API_TOKEN=<token> bash scripts/deploy_frontend.sh
npx wrangler secret put AGENT_FEATURE_ENABLED  # "true" only after E2E passes
```

User-facing setup (first GitHub connection): `/app/agent/` → **Register the GitHub App** (one-click manifest flow — GitHub pre-fills Contents + Pull requests R/W only; the app's private key + client secret are captured automatically, envelope-encrypted into `agent_app_config`) → **Connect GitHub** (OAuth web flow; the user token is used once to verify the installation and is discarded) → install the app on the site's repository during the same GitHub flow → pick the installation on `/app/agent/install` → start a fix job from any completed report.

Kill switches (no deploy needed): `update agent_flags set value='true' where key='global_kill_switch'` (all providers) or `'provider_github_enabled'` (GitHub only). The approve/apply path checks them before every write.

---

## 2. Cloudflare (Phase 3 — pending)

To research before coding: current best third-party access option (user-scoped OAuth if it exists; else minimal-permission user-created API token template: single account/zone/Worker, ~24 h expiry, over-broad tokens rejected via the token-verify endpoint). Verify: token verification endpoint (`GET /user/tokens/verify`), Workers preview-deploy endpoints, redirect/header rules APIs, rollback semantics.

**Verified fact (2026-09-29, Task 33, live):** account-scoped API tokens (`cfat_…`) do **NOT** authenticate at `GET /user/tokens/verify` — a valid account token gets `{"code":1000,"message":"Invalid API Token"}` there. Account tokens must be verified account-scoped (or via `wrangler whoami`, which resolves the associated account). Any Phase 3 "verify the user's token" flow must handle both token kinds or the check will falsely reject valid tokens. Deploy permissions confirmed working for an Account API token: Workers Scripts/Edit + Workers Deployments/Edit + Account Settings/Read (per `scripts/deploy_frontend.sh` header).

## 3. Supabase Management (Phase 4 — pending)

To research before coding: Supabase OAuth2 client registration (availability for third parties), narrowest scopes, token lifetimes, revocation endpoint + verification. Fallback (warned): PAT. v1 read-first: config, advisories, RLS status, missing FK indexes — schema metadata only, never row data. Writes: gated SQL migrations with a static SQL guard (allowlist: `ALTER TABLE … ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`, `CREATE INDEX CONCURRENTLY`; every migration ships a tested down-migration).
