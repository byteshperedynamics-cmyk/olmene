-- Engine v2 (2026-10-13): more kinds of sites (guided fixes for every
-- platform, Webflow/WordPress connections), screenshots and proposed fixes
-- on free scans, AI visibility, alert channels, pull-request checks,
-- per-report cost cap.
-- Additive and idempotent like engine v1: new tables/columns with defaults
-- only; nothing the current app reads is renamed or dropped. Safe to run twice.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Free scans: screenshot with pins, proposed fixes (both filled later)
-- ─────────────────────────────────────────────────────────────────────────
alter table public.scans add column if not exists shot jsonb;
alter table public.scans add column if not exists proposals jsonb;

-- Screenshots of public homepages, readable by anyone with the link (the
-- scan result points at them). Deleted with their scan (section 9).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scan-shots', 'scan-shots', true, 4194304, array['image/jpeg'])
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Guided fixes: values to paste + platform steps + live checks, for
--    sites that aren't in a GitHub repository (WordPress, Shopify, Wix…)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.guided_runs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  scan_id          uuid references public.scans(id) on delete set null,
  report_id        uuid,
  site_url         text not null,
  platform_id      text,
  platform         jsonb not null default '{}'::jsonb,
  fixes            jsonb not null default '[]'::jsonb,
  live_count       integer not null default 0,
  total_count      integer not null default 0,
  last_checked_at  timestamptz,
  notified_live_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists guided_runs_user_idx on public.guided_runs (user_id, created_at desc);
create index if not exists guided_runs_recheck_idx on public.guided_runs (last_checked_at nulls first) where notified_live_at is null;
alter table public.guided_runs enable row level security;
drop policy if exists guided_runs_own on public.guided_runs;
create policy guided_runs_own on public.guided_runs for select to authenticated using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- 3. API channels: Webflow site tokens and WordPress application passwords
--    (envelope-encrypted like every other connection secret)
-- ─────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'connections_provider_check') then
    alter table public.connections drop constraint connections_provider_check;
  end if;
  alter table public.connections
    add constraint connections_provider_check
    check (provider in ('github', 'cloudflare', 'supabase', 'google', 'webflow', 'wordpress'));
end $$;
alter table public.guided_runs add column if not exists connection_id uuid references public.connections(id) on delete set null;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Alert channels: Slack, Discord, webhooks (same events as the emails)
--    Read and written only through the Worker API (no client policies):
--    webhook URLs are secrets and are shown masked.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.alert_channels (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('slack', 'discord', 'webhook')),
  url          text not null,
  secret       text,
  label        text,
  kinds        text[] not null default '{}',
  active       boolean not null default true,
  failures     integer not null default 0,
  last_error   text,
  last_sent_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists alert_channels_user_idx on public.alert_channels (user_id) where active;
alter table public.alert_channels enable row level security;

alter table public.notifications add column if not exists channels_done_at timestamptz;
-- Rows that existed before this migration were already handled (email only).
update public.notifications set channels_done_at = coalesce(sent_at, created_at) where channels_done_at is null and created_at < now() - interval '1 minute';
create index if not exists notifications_channels_idx on public.notifications (created_at) where channels_done_at is null;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. AI search visibility (weekly, opt-in with the AI_VISIBILITY=1 secret)
-- ─────────────────────────────────────────────────────────────────────────
alter table public.sites add column if not exists profile jsonb;
alter table public.sites add column if not exists ai_prompts jsonb;
alter table public.sites add column if not exists ai_last jsonb;
alter table public.sites add column if not exists ai_next_check_at timestamptz not null default now();
create index if not exists sites_ai_due_idx on public.sites (ai_next_check_at) where monitor;

create table if not exists public.ai_visibility_runs (
  id                  bigserial primary key,
  site_id             uuid not null references public.sites(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  engine              text not null default 'gemini-search',
  mention_share       numeric not null,
  cite_share          numeric not null,
  competitor_mentions jsonb not null default '{}'::jsonb,
  results             jsonb not null default '[]'::jsonb,
  checked_at          timestamptz not null default now()
);
create index if not exists ai_visibility_runs_site_idx on public.ai_visibility_runs (site_id, checked_at desc);
alter table public.ai_visibility_runs enable row level security;
drop policy if exists ai_visibility_runs_own on public.ai_visibility_runs;
create policy ai_visibility_runs_own on public.ai_visibility_runs for select to authenticated using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Olmene checks on every pull request (needs the GitHub App's Checks:
--    write + Deployments: read permissions)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.pr_check_repos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  connection_id  uuid not null references public.connections(id) on delete cascade,
  repo           text not null,
  site_url       text not null,
  enabled        boolean not null default true,
  last_error     text,
  last_polled_at timestamptz,
  created_at     timestamptz not null default now(),
  unique (user_id, repo)
);
create index if not exists pr_check_repos_poll_idx on public.pr_check_repos (last_polled_at nulls first) where enabled;
alter table public.pr_check_repos enable row level security;

create table if not exists public.pr_checks (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  repo          text not null,
  pr_number     integer not null,
  head_sha      text not null,
  preview_url   text,
  conclusion    text not null check (conclusion in ('success', 'neutral', 'failure')),
  regressions   jsonb not null default '[]'::jsonb,
  improvements  jsonb not null default '[]'::jsonb,
  check_run_url text,
  created_at    timestamptz not null default now(),
  unique (repo, head_sha)
);
create index if not exists pr_checks_user_idx on public.pr_checks (user_id, created_at desc);
alter table public.pr_checks enable row level security;
drop policy if exists pr_checks_own on public.pr_checks;
create policy pr_checks_own on public.pr_checks for select to authenticated using (user_id = auth.uid());
