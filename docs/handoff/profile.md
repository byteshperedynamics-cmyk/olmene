# Handoff: Accounts / Profile (avatar, picture, display name)

**Branch:** `profile-wip` (cut from `design/mono` at `083dc08`, all work was uncommitted in the working tree — nothing was rebased, stashed or discarded)
**Parent:** `design/mono` — the monochrome redesign worktree (`olmene-design/`) of `github.com/byteshperedynamics-cmyk/olmene`
**Status when handed off:** all static checks green — `tsc --noEmit` clean, `eslint` 0 errors (2 pre-existing warnings in untouched files), `bun test src/lib/account` 14/14 pass, `npm run check:rls` ✓ 36 tables.

## What the feature does

Four pieces, one migration:

1. **Profile** — display name (1–60 chars) and profile picture (upload, crop in-browser to a 512px square, import from the Google account, or remove; initials fallback). First-run **welcome dialog** marks `onboarded_at`.
2. **Account settings page** (`/app/account/`) — identity, sign-in/security copy, email/notification switches, per-site progress with milestones, data export (JSON download), "delete my data" (keeps account + plan) and "delete account" (full wipe; blocked while a plan renews or a job runs; requires typing your email).
3. **Public progress links** — one shareable link per site (`/p/<slug>/`, 10-char slug), with optional name/avatar, copy/LinkedIn/Mail/WhatsApp sharing, view counting that skips link-preview bots, and `noindex` metadata for chat-app previews.
4. **Account menu** — avatar button in `app-header` and `site-header` opens menu: dashboard, account, share, billing, help, sign out (sign-out now navigates deliberately so the auth gate doesn't race it).

## ⚠️ Migration that ships to production on merge to main

**`supabase/migrations/20261021_accounts.sql`** — additive and idempotent (safe to run twice):

- `profiles` + `display_name text` (check: 1–60 chars), `avatar_path text`, `onboarded_at timestamptz`, `updated_at timestamptz default now()`
- **Creates storage bucket `avatars`**: public read, 1 MB limit, `image/webp|jpeg|png` only. No storage policies on purpose — the browser never uploads directly; the Worker writes with the service role after sniffing magic bytes.
- `analysis_jobs + deleted_at timestamptz` (soft-delete so monthly report counts/credits stay correct)
- New table **`progress_shares`** (`user_id`, `site_id unique`, `slug unique` `[a-z0-9]{10}`, `show_name`, `views`, `created_at`) with RLS: owner-only `select`. Writes go through the Worker.
- `bump_share_views(slug)` SQL function — `security definer`, execute revoked from everyone, granted to `service_role` only (no read-modify-write race).

## Manual steps after merge

- **None for env/secrets** — no new env vars. Avatar writes and the Google-photo import use the existing service-role key; `.env.production` already has everything the client needs.
- The `polar-webhook` edge function changed (see below) — if function deploys aren't wired to push to main, run `supabase functions deploy polar-webhook`. Without it, Polar keeps retrying webhooks for deleted users (harmless but noisy; the endpoint can get auto-disabled).
- Optionally re-run `npm run check:rls` after the migration applies (36 tables expected).

## Files added (26)

**API routes** (`src/app/api/account/`)
- `route.ts` — GET overview (sites progress + totals + shares + plan state in one call), PATCH profile (displayName/notifyEmail/digestEmail/onboarded), DELETE account (email confirm, blocked while renewing/busy).
- `avatar/route.ts` — POST upload (magic-byte sniffing, 1 MB cap, old file removed) or `{"from":"google"}` to copy the Google photo (only `*.googleusercontent.com` https URLs, resized to 512); DELETE back to initials.
- `data/route.ts` — GET JSON export (everything Olmene keeps, secrets excluded); DELETE "delete my data" (`confirm: "delete"`).
- `shares/route.ts` — POST create/return share link (retries on slug collision), PATCH showName, DELETE kills the link.

**Screens**
- `src/app/app/account/page.tsx` — the Account settings screen (react-query wrapper around AccountView).
- `src/app/p/[slug]/page.tsx` — public progress page: cached single read, OG/Twitter metadata, counts visits but skips preview bots.

**Components** (`src/components/account/`)
- `account-view.tsx` (696 lines) — the whole settings page: identity card, avatar editor trigger, toggles, progress cards, milestones, export/delete sections.
- `avatar-editor.tsx` — crop-to-square dialog (zoom slider), upload/remove/import-from-Google.
- `welcome-dialog.tsx` — first-run welcome; sets `onboarded_at`, offers "start first analysis".
- `account-menu.tsx` — the header avatar dropdown (account/share/billing/help/sign out), used by both headers.
- `user-avatar.tsx` — picture or initials on a steel disc; decorative by default.
- `progress-card.tsx` — one site's progress: score, trend, checks, milestones, AI-mention share.
- `score-trend.tsx` — weekly score line (SVG line, HTML dot/label), 75-hairline, band colour on the last point.
- `milestones.tsx` — account-level milestone board with copy + CTAs.
- `public-progress.tsx` — the /p/ page body: locked/disabled states, CTA back to Olmene.
- `share-dialog.tsx` — create/copy share link, show-name switch, channel buttons, turn-off.

**Lib**
- `src/lib/account-client.ts` — client half: `useProfile` (reads own row straight from Supabase via RLS), `identityOf`, write helpers for all four routes, `AccountError`.
- `src/lib/account/server.ts` — server half (service-role client only): site progress loader (≤12 sites, subrequest-safe), fixes-shipped count, public share loader, export document, `busyWith`, `renewingPlan`, `deleteUserData`, `deleteAccount`.
- `src/lib/account/progress.ts` — pure shaping: `SiteProgress`, history, milestones, `cleanDisplayName`, `newShareSlug`, `isShareSlug`, `scoreDelta`.
- `src/lib/account/__tests__/progress.test.ts` — 14 tests for the pure helpers (all pass).

**Dev galleries**
- `src/app/dev/account/{page,preview,fixtures}.ts*` — component gallery states (`?state=new`, `?welcome=1`) with fixtures.
- `src/app/dev/share/{page,preview}.tsx` — gallery for the public page (growing/new site fixtures).

**Migration**
- `supabase/migrations/20261021_accounts.sql` — see the warning section above.

## Files changed (25)

- `src/app/app/layout.tsx` — auth gate: `?next=` return-after-login (never carries a used code), `isLeaving()` sign-out guard, loads profile for the welcome dialog, wires identity into the header.
- `src/components/app-header.tsx` — sign-out button replaced by `AccountMenu` when an identity exists.
- `src/components/site-header.tsx` — same menu on the marketing site (i18n labels), "Get started" now deep-links `?mode=signup`.
- `src/lib/session.ts` — `signOut({to, everywhere})`: full-page navigation via `isLeaving()`, optional global scope.
- `src/app/login/page.tsx` — signin/signup modes, honours `?next=` and `?mode=` through OAuth/magic-link redirects, avatar in the identity preview.
- `src/components/ui/{dialog,alert-dialog}.tsx` — overlay gets `bg-black/60` + backdrop blur (visual only).
- `src/app/globals.css` — §12 account styles: `.o-trend-line/.o-trend-dot`, `.o-ring-fill` + reduced-motion variants.
- `src/i18n/dictionaries/{ar,bn,de,el,en,es,fr,hi,id,ja,pt,ru,tr,ur,zh}.json` — the new `account.*` / `login.*signup*` keys, 15 languages, all +66 lines.
- `src/lib/session.ts` — see above.
- `supabase/functions/polar-webhook/index.ts` — webhook events for a deleted user (FK 23503) are acknowledged `ok` instead of erroring, so Polar doesn't retry-storm or disable the endpoint.
- `tsconfig.json` — include `src/lib/account/__tests__` in typecheck.
- `src/app/dev/components/gallery.tsx` — AppHeader cell passes the new required `identity` prop.

## Finished

- Everything above compiles, typechecks, lints; the pure-logic tests pass. All four API routes are complete with auth, confirmation and error paths. Migration is written, additive, idempotent.

## Half-done / to verify by hand

- **No end-to-end click-through was done** before handoff (I only ran static checks + unit tests). Worth a manual pass: avatar upload+crop, Google import, welcome dialog on first login, share-link create → open in incognito → view count, delete-my-data vs delete-account (use a throwaway account).
- The **`check:rls` count will change** (36 → 37) once `progress_shares` exists in the live database the script points at — expected, not a failure.
- `login/page.tsx` was heavily reworked (+441 lines) — the `?next=` handling deserves a second pair of eyes for open-redirect hygiene (it only composes same-origin paths from `location.search`, but verify).

## Not started (known gaps)

- No **email-verification / change-email** flow on the account page (the section copy references support).
- No **session/device list** ("sign out everywhere" button exists in the menu only via scope).
- **Milestones** are computed but there's no notification/celebration hook when one is earned.
- i18n: the new keys were translated, but nobody has proof-read the non-English copy.

## Repo geography (for the next agent)

`olmene/`, `olmene-design/`, `olmene-engine/`, `olmene-v2/` under `~/Documents/Olmene/` are **four worktrees of the same repo**, on `main`, `design/mono`, `engine/v2`, `redesign/v2` respectively. This work happened on `design/mono`'s worktree; `profile-wip` was created there. Never push to `main` — a push to main deploys olmene.com.
