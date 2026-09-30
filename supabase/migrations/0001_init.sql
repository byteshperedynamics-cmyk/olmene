-- Marketwise — initial schema (spec §6, implemented verbatim)
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table public.plans (
  polar_product_id text primary key,
  name text not null,
  reports_per_period int not null check (reports_per_period > 0),
  price_label text not null default '',      -- display only, e.g. '$19 / month'; real price lives in Polar
  sort_order int not null default 0,
  active boolean not null default true
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  polar_subscription_id text not null unique,
  polar_customer_id text,
  polar_product_id text references public.plans(polar_product_id),
  status text not null,                       -- mirror of Polar status
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_event_at timestamptz,                  -- newest applied webhook event time (out-of-order guard)
  updated_at timestamptz not null default now()
);
create index on public.subscriptions(user_id);

create table public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  site_url text not null,
  input jsonb not null,                       -- validated StartAnalysisInput
  status text not null default 'queued'
    check (status in ('queued','running','completed','failed','canceled')),
  current_step text not null default 'crawl',
  step_outputs jsonb not null default '{}'::jsonb,
  step_log jsonb not null default '[]'::jsonb, -- [{step, status, started_at, ended_at, model, error}]
  error text,
  attempts int not null default 0,
  locked_until timestamptz,
  wait_reason text,                            -- e.g. 'llm_daily_budget', shown in UI
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index on public.analysis_jobs(user_id, created_at desc);
create index on public.analysis_jobs(status, locked_until);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.analysis_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  data jsonb not null,                         -- validated Report (src/shared/report.ts)
  models_used text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.reports(user_id, created_at desc);

create table public.llm_models (                -- ordered fallback list, editable without redeploy
  id text primary key,                          -- OpenRouter model id, e.g. 'openrouter/free'
  priority int not null,                        -- lower = tried first
  supports_json_schema boolean not null default false,
  active boolean not null default true,
  note text
);

create table public.usage_counters (
  key text primary key,                         -- 'llm:2026-09-24', 'tavily:2026-09'
  count int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.webhook_events (            -- idempotency for Polar webhooks
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- Atomic budget check: returns true and increments only if within cap.
create or replace function public.consume_budget(p_key text, p_amount int, p_cap int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into usage_counters(key, count) values (p_key, 0) on conflict (key) do nothing;
  update usage_counters set count = count + p_amount, updated_at = now()
   where key = p_key and count + p_amount <= p_cap
  returning count into v_count;
  return v_count is not null;
end $$;

-- Lease-based claim so two callers never run the same job step concurrently.
create or replace function public.claim_job(p_job_id uuid, p_lease_seconds int default 150)
returns setof public.analysis_jobs language sql security definer set search_path = public as $$
  update analysis_jobs
     set locked_until = now() + make_interval(secs => p_lease_seconds),
         status = 'running',
         started_at = coalesce(started_at, now())
   where id = p_job_id
     and status in ('queued','running')
     and (locked_until is null or locked_until < now())
  returning *;
$$;

revoke all on function public.consume_budget(text,int,int) from public, anon, authenticated;
revoke all on function public.claim_job(uuid,int) from public, anon, authenticated;

-- Profile row on signup
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS: clients may only READ their own rows. All writes go through Edge Functions (service role).
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.analysis_jobs enable row level security;
alter table public.reports enable row level security;
alter table public.llm_models enable row level security;
alter table public.usage_counters enable row level security;
alter table public.webhook_events enable row level security;

create policy "own profile" on public.profiles for select using (id = auth.uid());
create policy "public plans" on public.plans for select using (active);
create policy "own subscriptions" on public.subscriptions for select using (user_id = auth.uid());
create policy "own jobs" on public.analysis_jobs for select using (user_id = auth.uid());
create policy "own reports" on public.reports for select using (user_id = auth.uid());
-- llm_models, usage_counters, webhook_events: no client policies (service role only).
