# Handoff: companies and agencies (workspaces, agency features, and what's next)

Written 15 Oct 2026 by Claude (cloud session) for the next Claude working on
Olmene in Cowork on Hermes's PC. Read this whole file before touching code.

## Where things stand in one paragraph

Hermes wants Olmene to sell to serious companies and agencies, not only
developers, and asked for the missing features to be built "one by one".
Nothing from this work is live yet: it all sits on branches, stacked on top
of each other, and **a push to `main` deploys production** (Workers Builds
runs `supabase db push` and deploys). Never merge or push to `main` without
Hermes saying yes.

**Update, evening of 15 Oct (Claude on Hermes's PC):** Hermes said yes to
releasing `profile-fixes` → `workspaces` → `agency`. `design/mono` was
fast-forwarded to `agency` (982aad6) and pushed; Hermes releases it with
`bash ~/Documents/Olmene/deploy-site.sh` (it needs `olmene-design/` on
`design/mono`). Check `git log origin/main` to see whether he has. The repo
had no `SUPABASE_ACCESS_TOKEN` Actions secret, so "Deploy edge functions"
skipped every step on main pushes; Hermes added it on 15 Oct. Check that the
first run after the release really deployed (its steps aren't "skipped"):
this stack changes `notify`, `start-analysis` and `advance-analysis`. 2b
(emailed client reports) is done on branch `client-reports`, stacked on
`agency`, in worktree `olmene-reports/`.

## Branches (all pushed to github.com/byteshperedynamics-cmyk/olmene)

```
main ─ ce5a8e5  (live: GLM's accounts/profile feature)
  └─ profile-fixes ─ 0867b70, 445ed9e          CI green, WAITING FOR HERMES'S OK TO MERGE
       └─ workspaces ─ 3b61902, 2e673aa, c1d2cb4   CI green
            └─ agency ─ 7eab556, 982aad6        CI green; design/mono = this, release pending
                 └─ client-reports ─ 2b           CI: check it
```

- **profile-fixes**: fixes to GLM's profile work that is already live:
  open-redirect fix for `?next=` (`src/lib/safe-next.ts`, used by login and
  Google sign-in), deleted analyses no longer listed (`src/lib/data.ts`),
  "delete my data" clears the right caches, welcome dialog focus, phone layout
  of the "Up next" card. Hermes has not said yes to merging yet.
- **workspaces**: step 1 of the plan (teams). See `docs/workspaces.md`.
- **agency**: step 2, part 1 (clients, client pages, branding). See
  `docs/agency.md`.

To pick up: `git fetch origin && git switch agency` (track it if needed:
`git switch -c agency --track origin/agency`).

## The plan Hermes approved (build in this order)

1. **Workspaces**: members, roles, invitations. DONE (branch `workspaces`).
2. **Agency features**:
   - a. Clients, client pages `/c/<slug>/`, own branding, white label. DONE
     (branch `agency`; release approved 15 Oct).
   - b. Scheduled client reports by email. DONE (branch `client-reports`;
     see "2b" below and `docs/agency.md`).
   - c. Agency overview screen (all clients at a glance). TODO.
   - d. Branded scan box agencies embed on their own site (lead capture). TODO.
3. **Company features**: Microsoft sign-in, GitLab (fix runs open merge
   requests), team approval history screen. TODO.
4. **Trust pages**: company details, DPA, list of data processors
   (subprocessors), status page. TODO.
5. **New plans**: Business and Agency plans. Hermes must first create the
   products in Polar; then wire slugs into `SEATS_BY_PLAN`
   (`src/lib/workspace/roles.ts`) and `canWhiteLabel`
   (`src/lib/agency/rules.ts`, already accepts `agency` / `agency-yearly`).

Defaults Hermes was told: free = just you, Fix = 2 people, Team = 5 people;
white label comes with Team (and a future Agency plan).

## How workspaces work (read `docs/workspaces.md` for detail)

- A workspace is "the account that pays". **All data stays keyed by the
  owner's `user_id`**; members read through extra RLS policies
  (`user_id in (select public.readable_owner_ids())`) and write only through
  the Worker.
- Roles: owner > admin > member > viewer (`src/lib/workspace/roles.ts`).
- Worker routes call `requireActor(req, minRole)`
  (`src/lib/workspace/server.ts`). The browser sends header
  `x-olmene-workspace: <owner user id>` (from localStorage `olm_ws`). Use
  `actor.ownerId` for data, `actor.user.id` for "who did it".
- Edge functions take `workspace` in the body and check it with
  `supabase/functions/_shared/workspace.ts`.
- Invitations: only the SHA-256 of the token is stored; 14 days; single use;
  bound to the invited email; emailed by `notify` (kind `workspace_invite`,
  never posted to Slack/Discord channels).
- Browser helpers: `src/lib/workspace/client.ts` (`apiCall` sends auth +
  workspace header and turns errors into `TeamApiError`; `useWorkspaces`;
  `setActiveWorkspace`). Errors thrown on the server are `TeamError`
  (now defined in `roles.ts`, re-exported from `server.ts`) and turned into
  responses with `teamErrorResponse`.

## What the `agency` branch adds

- Migration `supabase/migrations/20261023_agency.sql`: `clients`,
  `sites.client_id`, brand columns on `workspaces` (`brand_name`,
  `brand_color`, `brand_url`, `logo_path`, `white_label`), public bucket
  `brand-assets` (PNG/JPEG/WebP, 512 KB, no SVG), `client_portals` (one link
  per client, 12-char slug), `bump_portal_views()` (service role only).
  Test: `supabase/tests/agency.test.sql`.
- Shared rules (browser + Worker, unit-tested): `src/lib/agency/rules.ts`
  (`cleanClientInput`, `cleanBrandInput`, `normalizeWebsite`,
  `newPortalSlug`, `sniffImage`, `canWhiteLabel`). Tests:
  `src/lib/agency/__tests__/rules.test.ts`.
- Server: `src/lib/agency/server.ts` (`clientsView`, client CRUD, `assignSite`,
  portal on/off, `loadPortal`, `publicBrandOf`, `updateBrand`, logo upload).
- API routes: `/api/clients`, `/api/clients/[id]`, `/api/clients/[id]/portal`,
  `/api/sites/[id]/client`, `/api/workspace/brand`, `/api/workspace/brand/logo`.
  Every change returns the whole Clients page state (`{ view }`).
- Screens:
  - `/app/clients/` (`src/app/app/clients/page.tsx`,
    `src/components/agency/clients-view.tsx`, `brand-settings.tsx`):
    clients with their sites, "Move…" / "Give to a client…" pickers, client
    page link (create / copy / open / turn off with confirm), sites without a
    client, branding form with live preview, white-label switch (plan-gated).
    Viewers read only; members manage clients and links; admins also branding
    and removing clients.
  - "Clients" appears in the app nav only for agency workspaces
    (`src/components/app-header.tsx`; the inline nav moves to `xl` when the
    links plus the switcher don't fit at `lg`).
  - Team page: "What it's for" Company / Agency choice
    (`src/components/workspace/team-view.tsx`, `KindForm`).
  - Client page `/c/[slug]/` (`src/app/c/[slug]/page.tsx`,
    `src/components/agency/client-portal.tsx`): brand bar (logo alone, or the
    name), "Prepared by …", one progress card per site (max 12), privacy
    line, "Measured with Olmene" unless white label. noindex, no-referrer.
  - Progress links `/p/[slug]/` shared from an agency workspace now use the
    same branded shell and drop Olmene's sign-up pitch.
  - Pages an agency's clients see carry `data-agency-page`; the cookie banner
    and Google Analytics stay off them (`src/lib/consent.ts onAgencyPage`).
  - Portal strings are translated in all 15 dictionaries (`portal.*`).
- Account export includes clients and client pages; data deletion removes
  them; account deletion removes the workspace's logo files.
- Dev gallery (works with no backend; the Clients page runs against an
  in-memory copy of the API, `src/app/dev/clients/fake-api.ts`):
  - `/dev/clients/?role=owner|admin|member|viewer&state=company|new|empty&brand=none|wl&plan=fix`
  - `/dev/portal/?state=wl|plain|name|empty|gone`
  - `/dev/share/?state=agency|agency-wl`
- `docs/handoff/clients_flows.py`: a Playwright click-through of every
  action on `/dev/clients/` (add/edit/remove client, give/move sites, client
  page on/copy/off, branding validation/save/white label, logo upload and SVG
  refusal, viewer/member/company/Fix-plan states). It passed at 1280 light and
  390 dark. Run: `python3 docs/handoff/clients_flows.py <out_dir> <some.jpg> [light|dark] [width]`
  with `next dev` on port 3000.

### Checks already done on `agency`

- `tsc` clean; `eslint` 0 errors (2 old warnings in `src/i18n/provider.tsx`
  and `workers/get-redirect`, not ours); `bun test src/lib` 251 pass;
  `check:rls` 41 tables OK; i18n validator passes.
- `npm run test:sql` passed earlier on this branch (21 migrations, both
  migrations re-run for idempotency, `agency.test.sql` and
  `workspaces.test.sql` green). It was not re-run after the last UI-only
  changes; the SQL files did not change since.
- Screenshots reviewed: light/dark/phone for the Clients page (all roles and
  states), client page, branded progress link, Team page, header at
  390/640/768/1024/1180/1280.

### Still to do to finish 2a (small)

1. Done (15 Oct): CI on `agency` green, and its SQL tests job passed (21
   migrations, recent ones twice; `agency.test.sql`, `workspaces.test.sql`).
   Hermes's PC has no Postgres, so `npm run test:sql` runs only in CI there.
2. Done (15 Oct): re-screenshotted at 1024 and 390, light and dark. The
   banner did show on `/dev/portal/` and `/dev/share/`: those previews drew
   after mount, so `data-agency-page` wasn't there yet when the banner
   looked. They are server-rendered now, like the real `/c/` and `/p/`.
   Hermes's PC has no Python Playwright, so `clients_flows.py` wasn't re-run
   (nothing it covers changed).
3. Tell Hermes what's ready and wait for his OK before anything goes to main.
   Merge order when he says yes: `profile-fixes` → `workspaces` → `agency`
   (each is based on the previous one).

## 2b. Emailed client reports (done, branch `client-reports`)

Read `docs/agency.md` ("Emailed client reports"). Where it differs from the
first design:

- **One notification per recipient**, not one per client with a `to` list:
  each row then retries, goes stale and is marked on its own, and nobody
  gets a second copy because someone else's address bounced.
- **Built when sent**, by `notify` (`notify/client-report.ts`), not when
  queued: "Send me a test" and the scheduled email are the same code, and
  the Worker doesn't need a second copy of the report logic.
- **Fixed slots** (`clients.report_next_at`): Mondays or the 1st at 08:00
  UTC, set when the cadence is chosen. Agencies get time to add people, and
  the first email doesn't fire ten minutes after the first click.
- **Unsubscribed people stay listed** and can't be added back or removed;
  their tokens are hidden from browsers with column grants.

Not done, worth considering: a "reports sent" history on the client card
(the activity feed on `/app/sites/` lists them); per-recipient language
(emails are English, like every other Olmene email); a custom sender domain
for white-label agencies (the From address is still Olmene's).

## Next: 2c, then 2d (ideas agreed in principle)

- **2c Overview**: top of `/app/clients/` (or its own tab): totals (clients,
  sites, average score), "needs attention" (score dropped since last scan,
  not scanned for 14+ days, client page never opened), sortable list of all
  sites with client, score, change, last scan.
- **2d Branded scan box**: an embeddable "Free website check by {agency}"
  box (iframe page + small script snippet shown on the Clients page). Reuse
  the free scan (`supabase/functions/free-audit`, `src/components/free-scan-v2.tsx`),
  keep its rate limits, store leads (name, email, URL, score) for the agency,
  notify the agency, show leads on the Clients page. Branded with the
  agency's brand; "Measured with Olmene" unless white label.

## Steps 3 to 5 (not started)

- **Microsoft sign-in**: Supabase Azure provider; mirror how Google sign-in
  is done (`src/lib/google-signin*.ts`, login page). Hermes must create the
  Azure app registration and put the keys in Supabase.
- **GitLab**: connection like GitHub's (`src/app/api/connect/*`,
  `src/lib/agent/*`), fix runs open merge requests. Needs a GitLab OAuth app.
- **Approval history**: a screen listing who approved/rejected/cancelled what
  and when (data exists: `approvals.decided_by`, audit `detail.by`,
  `agent_jobs.created_by`). Admin export as CSV.
- **Trust pages**: company details, DPA, subprocessors list (Supabase,
  Cloudflare, Polar, Brevo, Google Analytics, AI providers in use), status
  page (there is a `health` function and `health-watch`). Hermes must supply
  legal company details; don't invent them.
- **Plans**: see step 5 above.

## Things Hermes should know / do (remind him)

- He pasted a GitHub token in chat earlier; it should be revoked on GitHub.
- On 15 Oct he pasted the Supabase access token into chat to add it as the
  `SUPABASE_ACCESS_TOKEN` secret; after the release, worth rotating it
  (Supabase → Account → Access Tokens) and updating the secret.
- Production has `plans.one_time` and table `report_credits` that no
  migration creates (made by hand). `scripts/test-sql.mjs` adds `one_time`
  before `20261010`; the workspace migration only touches `report_credits`
  if it exists. Worth a migration that creates both `if not exists`.
- Workers Builds checks fail instantly on non-main branches; that is normal
  and not caused by this work.

## Conventions to keep

- `AGENTS.md`: this is Next.js 16; read `node_modules/next/dist/docs/` before
  using an API you're unsure of.
- Branch per step; push branches; never push or merge to `main` without
  Hermes's yes. Commits end with the co-author trailer your environment gives.
- Copy in the app is plain, short, friendly English ("Couldn't save the
  logo. Try again in a moment."). Public pages (`/c/`, `/p/`) use the i18n
  dictionaries; add every new key to all 15 and run
  `node scripts/i18n_validate.js`.
- Every new table: RLS on, workspace read policy, writes through the Worker
  with `requireActor` and the right minimum role; add a SQL test.
- Before saying something is done: `npx tsc --noEmit`, `npm run lint`,
  `bun test src/lib`, `npm run check:rls`, `npm run test:sql`, i18n
  validator, screenshots in light, dark and at phone width (no sideways
  scroll), and a click-through of the flows.
