-- Accounts (2026-10-15): a name and a profile picture, a first-run welcome,
-- links that share a site's progress, and "delete my data".
-- Additive and idempotent like engine v1/v2: new columns with defaults and a
-- new table only. Safe to run twice.
--
-- Writes still go through the Worker with the service role (0001_init: the
-- client only ever reads its own rows).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Profile: name, picture, first-run state
-- ─────────────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists avatar_path text;      -- <user id>/<random>.webp in the avatars bucket
alter table public.profiles add column if not exists onboarded_at timestamptz;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_display_name_len') then
    alter table public.profiles
      add constraint profiles_display_name_len check (display_name is null or char_length(display_name) between 1 and 60);
  end if;
end $$;

-- Profile pictures are public to read (they show on shared progress pages).
-- Only the Worker writes them, after it has checked the image itself.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Delete my data: an analysis is emptied and hidden, not removed, so the
--    month's report count (and any report credit it used) stays correct.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.analysis_jobs add column if not exists deleted_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Progress links: one public link per site, until its owner turns it off
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.progress_shares (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  site_id     uuid not null unique references public.sites(id) on delete cascade,
  slug        text not null unique check (slug ~ '^[a-z0-9]{10}$'),
  show_name   boolean not null default true,
  views       integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists progress_shares_user_idx on public.progress_shares (user_id);
alter table public.progress_shares enable row level security;
drop policy if exists progress_shares_own on public.progress_shares;
create policy progress_shares_own on public.progress_shares for select to authenticated using (user_id = auth.uid());

-- Count a visit without a read-modify-write race. Service role only.
create or replace function public.bump_share_views(p_slug text) returns void
language sql
security definer
set search_path = public
as $$
  update public.progress_shares set views = views + 1 where slug = p_slug;
$$;
revoke all on function public.bump_share_views(text) from public, anon, authenticated;
grant execute on function public.bump_share_views(text) to service_role;
