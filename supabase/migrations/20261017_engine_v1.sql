-- Engine v1 (2026-10-13): saved scans, usage ledger, notification outbox,
-- monitoring, competitor snapshots, faster job drivers.
-- Additive and idempotent: new tables/columns only (with defaults), nothing
-- the current app reads is renamed or dropped. Safe to run twice.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Saved scans (free scans + monitoring re-scans)
--    result:    the JSON the free-audit API returns (minus scanId)
--    page_text: visible homepage text for the fix planner; never returned
--    expires_at: anonymous scans expire after 30 days; claimed/monitor rows never
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.scans (
  id          uuid primary key default gen_random_uuid(),
  site_url    text not null,
  host        text not null,
  result      jsonb not null,
  page_text   text,
  profile     jsonb,
  ip_hash     text,
  user_id     uuid references auth.users(id) on delete set null,
  site_id     uuid,
  source      text not null default 'free' check (source in ('free', 'monitor')),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz
);
create index if not exists scans_url_recent_idx on public.scans (site_url, created_at desc);
create index if not exists scans_site_idx on public.scans (site_id, created_at desc);
create index if not exists scans_user_idx on public.scans (user_id, created_at desc);
alter table public.scans enable row level security;
-- No client policies: scans are read through the free-audit function by id.

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Usage ledger: every AI call, research credit and page render
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.engine_usage (
  id                bigserial primary key,
  created_at        timestamptz not null default now(),
  kind              text not null check (kind in ('llm', 'research', 'render')),
  source            text not null check (source in ('analysis', 'agent', 'scan', 'monitor')),
  job_id            uuid,
  agent_job_id      uuid,
  user_id           uuid,
  step              text,
  provider          text,
  model             text,
  prompt_tokens     int,
  completion_tokens int,
  reasoning_tokens  int,
  cached_tokens     int,
  units             numeric,          -- research credits, or render seconds
  latency_ms        int,
  ok                boolean not null default true,
  error             text
);
create index if not exists engine_usage_job_idx on public.engine_usage (job_id) where job_id is not null;
create index if not exists engine_usage_day_idx on public.engine_usage (created_at desc);
alter table public.engine_usage enable row level security;

-- Prices for cost estimates (USD per million tokens). Approximate list
-- prices at the time of writing; update the rows when Google/Mistral change them.
alter table public.llm_models add column if not exists input_usd_per_mtok numeric;
alter table public.llm_models add column if not exists output_usd_per_mtok numeric;
alter table public.llm_models add column if not exists cached_input_usd_per_mtok numeric;
update public.llm_models
   set input_usd_per_mtok = coalesce(input_usd_per_mtok, 0.50),
       output_usd_per_mtok = coalesce(output_usd_per_mtok, 3.00),
       cached_input_usd_per_mtok = coalesce(cached_input_usd_per_mtok, 0.05)
 where id in ('vertex/google/gemini-3.8-flash', 'vertex/google/gemini-3.6-flash');

-- EU fallback provider (Mistral, paid API: no training on inputs). Used only
-- when the MISTRAL_API_KEY secret is set; without it the engine skips the row.
-- Add Mistral to the privacy policy's processor list before setting the key.
insert into public.llm_models (id, priority, supports_json_schema, active, note, input_usd_per_mtok, output_usd_per_mtok)
values ('mistral/mistral-medium-latest', 3, false, true,
        'EU fallback when both Vertex models fail. Needs MISTRAL_API_KEY (edge functions + Worker).', 0.40, 2.00)
on conflict (id) do nothing;

-- Cost per call (token counts × model price; research $0.008/credit at
-- Tavily pay-as-you-go; rendering $0.09/browser-hour beyond the plan's 10 h).
create or replace view public.engine_usage_costed with (security_invoker = true) as
select u.*,
       case u.kind
         when 'llm' then round((
             greatest(coalesce(u.prompt_tokens, 0) - coalesce(u.cached_tokens, 0), 0) * coalesce(m.input_usd_per_mtok, 0)
           + coalesce(u.cached_tokens, 0) * coalesce(m.cached_input_usd_per_mtok, m.input_usd_per_mtok, 0)
           + coalesce(u.completion_tokens, 0) * coalesce(m.output_usd_per_mtok, 0)
         ) / 1e6, 6)
         when 'research' then round(coalesce(u.units, 0) * 0.008, 6)
         when 'render' then round(coalesce(u.units, 0) / 3600.0 * 0.09, 6)
       end as cost_usd
  from public.engine_usage u
  left join public.llm_models m on m.id = u.model;

create or replace view public.engine_cost_by_job with (security_invoker = true) as
select job_id,
       min(created_at) as started_at,
       count(*) filter (where kind = 'llm') as llm_calls,
       count(*) filter (where kind = 'llm' and not ok) as llm_failures,
       sum(prompt_tokens) as prompt_tokens,
       sum(completion_tokens) as completion_tokens,
       sum(units) filter (where kind = 'research') as research_credits,
       round(sum(cost_usd), 4) as cost_usd
  from public.engine_usage_costed
 where job_id is not null
 group by job_id;

create or replace view public.engine_cost_daily with (security_invoker = true) as
select date_trunc('day', created_at)::date as day, source, kind,
       count(*) as events, sum(units) as units,
       sum(prompt_tokens) as prompt_tokens, sum(completion_tokens) as completion_tokens,
       round(sum(cost_usd), 4) as cost_usd
  from public.engine_usage_costed
 group by 1, 2, 3;

revoke all on public.engine_usage_costed, public.engine_cost_by_job, public.engine_cost_daily from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Notifications: outbox + per-user email preferences
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,   -- report_ready | pr_opened | fixes_live | fix_regression | site_regression | competitor_change | weekly_digest
  payload     jsonb not null default '{}'::jsonb,
  dedupe_key  text unique,
  status      text not null default 'pending' check (status in ('pending', 'sent', 'skipped', 'failed')),
  attempts    int not null default 0,
  error       text,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index if not exists notifications_pending_idx on public.notifications (created_at) where status = 'pending';
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'notifications' and policyname = 'own notifications') then
    create policy "own notifications" on public.notifications for select using (user_id = auth.uid());
  end if;
end $$;

alter table public.profiles add column if not exists notify_email boolean not null default true;   -- report ready, PR opened, re-checks, regressions
alter table public.profiles add column if not exists digest_email boolean not null default true;   -- weekly digest
alter table public.profiles add column if not exists unsubscribe_token uuid not null default gen_random_uuid();

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Monitoring: sites + competitor snapshots
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.sites (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  url             text not null,
  host            text not null,
  monitor         boolean not null default true,
  last_scan_id    uuid references public.scans(id) on delete set null,
  last_scan_at    timestamptz,
  last_score      int,
  last_checklist  jsonb,
  next_scan_at    timestamptz not null default now(),
  competitors     jsonb not null default '[]'::jsonb,   -- [{name,url}] from the latest report
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, host)
);
create index if not exists sites_due_idx on public.sites (next_scan_at) where monitor;
alter table public.sites enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'sites' and policyname = 'own sites') then
    create policy "own sites" on public.sites for select using (user_id = auth.uid());
  end if;
end $$;

create table if not exists public.competitor_snapshots (
  id              bigserial primary key,
  site_id         uuid not null references public.sites(id) on delete cascade,
  competitor_url  text not null,
  title           text,
  h1              text,
  price_points    text[] not null default '{}',
  text_hash       text,
  captured_at     timestamptz not null default now()
);
create index if not exists competitor_snapshots_idx on public.competitor_snapshots (site_id, competitor_url, captured_at desc);
alter table public.competitor_snapshots enable row level security;

-- Brand → homepage cache: verified competitor domains are reused across
-- reports instead of spending a research credit to look them up again.
create table if not exists public.competitor_domains (
  brand_key    text primary key,
  homepage     text not null,
  method       text not null check (method in ('pick', 'guess', 'search')),
  verified_at  timestamptz not null default now()
);
alter table public.competitor_domains enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Fix runs can plan from a saved scan (free preview) instead of a report
-- ─────────────────────────────────────────────────────────────────────────
alter table public.agent_jobs add column if not exists scan_id uuid references public.scans(id) on delete set null;
create index if not exists agent_jobs_driver_idx on public.agent_jobs (locked_until nulls first)
  where status in ('queued', 'planning', 'previewing', 'applying', 'verifying');

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Schedules. Seconds-level pg_cron schedules ("20 seconds") need pg_cron
--    1.5+; older versions fall back to every minute. Functions named here
--    (notify, monitor, health-watch) answer 404 until deployed: harmless.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.olmene_schedule(p_name text, p_fast text, p_slow text, p_command text)
returns void language plpgsql security definer set search_path = public, cron as $$
begin
  if exists (select 1 from cron.job where jobname = p_name) then
    perform cron.unschedule(p_name);
  end if;
  begin
    perform cron.schedule(p_name, p_fast, p_command);
  exception when others then
    perform cron.schedule(p_name, p_slow, p_command);
  end;
end $$;
revoke all on function public.olmene_schedule(text, text, text, text) from public, anon, authenticated;

-- The report driver ('sweep-jobs') stays every minute on purpose: each
-- finished step now queues the next one itself (advance-analysis), so the
-- sweeper is only the safety net, and a faster schedule would overlap with
-- the previous sweeper version if functions are deployed after this runs.

-- Fix-run driver: runs move without an open tab (approve → PR opens).
select public.olmene_schedule('olmene-agent-advance', '20 seconds', '* * * * *', $cron$
  select net.http_post(
    url := public.vault_secret('app_base_url') || '/api/cron/agent/',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.vault_secret('cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$cron$);

-- Customer emails (outbox → Brevo). Sends nothing until BREVO_API_KEY is set.
select public.olmene_schedule('olmene-notify', '* * * * *', '* * * * *', $cron$
  select net.http_post(
    url := public.vault_secret('functions_base_url') || '/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.vault_secret('cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$cron$);

-- Weekly site monitoring + digests, processed in small batches.
select public.olmene_schedule('olmene-monitor', '*/10 * * * *', '*/10 * * * *', $cron$
  select net.http_post(
    url := public.vault_secret('functions_base_url') || '/monitor',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.vault_secret('cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$cron$);

-- Uptime + error watch: probes the Worker's API routes and mails new errors.
select public.olmene_schedule('olmene-health-watch', '*/5 * * * *', '*/5 * * * *', $cron$
  select net.http_post(
    url := public.vault_secret('functions_base_url') || '/health-watch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.vault_secret('cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$cron$);

-- Expired anonymous scans.
select public.olmene_schedule('olmene-prune-scans', '23 3 * * *', '23 3 * * *', $cron$
  delete from public.scans where expires_at is not null and expires_at < now();
$cron$);
