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
