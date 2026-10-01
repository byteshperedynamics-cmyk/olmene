-- Measure: Search Console data + measured outcomes of merged fixes
-- (docs/design/IMPLEMENTATION_BRIEF.md §6.4). Additive; RLS on; owners may
-- SELECT their own rows; all writes go through the service role (cron sync,
-- OAuth callback) like the agent tables. Feature-flagged off in the app
-- (MEASURE_FEATURE_ENABLED / NEXT_PUBLIC_FEATURE_MEASURE).

-- Allow Google as a connection provider (widening only).
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'connections_provider_check') then
    alter table public.connections drop constraint connections_provider_check;
  end if;
  alter table public.connections
    add constraint connections_provider_check
    check (provider in ('github', 'cloudflare', 'supabase', 'google'));
end $$;

create table if not exists public.gsc_daily (
  connection_id uuid not null references public.connections(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  date          date not null,
  clicks        int not null default 0,
  impressions   int not null default 0,
  ctr           numeric(8, 5),
  position      numeric(8, 2),
  fetched_at    timestamptz not null default now(),
  primary key (connection_id, date)
);
create index if not exists gsc_daily_user_date_idx on public.gsc_daily (user_id, date desc);

create table if not exists public.fix_outcomes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.connections(id) on delete cascade,
  -- the merged fix runs measured together (combined when > 1)
  agent_job_ids uuid[] not null,
  merge_date    date not null,
  status        text not null check (status in ('early', 'measured', 'combined', 'insufficient')),
  metric        text not null default 'clicks',
  before_mean   numeric(12, 2),
  after_mean    numeric(12, 2),
  delta         numeric(12, 2),
  delta_pct     numeric(8, 2),
  p_value       numeric(6, 4),
  confidence    text check (confidence is null or confidence in ('low', 'medium', 'high')),
  before_days   int not null default 0,
  after_days    int not null default 0,
  computed_at   timestamptz not null default now(),
  unique (connection_id, merge_date, metric)
);
create index if not exists fix_outcomes_user_idx on public.fix_outcomes (user_id, merge_date desc);

alter table public.gsc_daily enable row level security;
alter table public.fix_outcomes enable row level security;

drop policy if exists "own gsc daily" on public.gsc_daily;
create policy "own gsc daily" on public.gsc_daily for select using (user_id = auth.uid());
drop policy if exists "own fix outcomes" on public.fix_outcomes;
create policy "own fix outcomes" on public.fix_outcomes for select using (user_id = auth.uid());
