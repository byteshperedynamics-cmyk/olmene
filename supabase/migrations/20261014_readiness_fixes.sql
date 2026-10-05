-- Readiness fixes (2026-10-04). Additive and idempotent.
--
-- 1. connections: the GitHub link route upserts on
--    (user_id, provider, external_installation_id), but the only unique index
--    was on an EXPRESSION (coalesce(external_installation_id, '')), which
--    Postgres cannot use as an ON CONFLICT target (error 42P10). Every link
--    attempt failed with "Could not save the connection". A plain unique
--    constraint on the same columns fixes it (NULLs stay distinct, so rows
--    without an installation id are unaffected).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'connections_user_provider_install_key') then
    alter table public.connections
      add constraint connections_user_provider_install_key
      unique (user_id, provider, external_installation_id);
  end if;
end $$;

-- 2. Agent sync (PR merge tracking + live re-checks) — nothing called
--    POST /api/cron/sync/ before. pg_cron calls the Worker every 10 minutes
--    with the SAME Vault cron_secret the sweeper already uses; the Worker
--    verifies it against Vault through the service role, so no extra secret
--    has to be copied to Cloudflare by hand.
insert into vault.secrets (secret, name)
select 'https://olmene.com', 'app_base_url'
where not exists (select 1 from vault.secrets where name = 'app_base_url');

do $$
begin
  if exists (select 1 from cron.job where jobname = 'olmene-agent-sync') then
    perform cron.unschedule('olmene-agent-sync');
  end if;
end $$;

select cron.schedule(
  'olmene-agent-sync',
  '*/10 * * * *',
  $cron$
  select net.http_post(
    url := public.vault_secret('app_base_url') || '/api/cron/sync/',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.vault_secret('cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $cron$
);

-- 3. Free-scan IP log: rows only serve the 1-hour rate limit; the public
--    counter is cumulative (stat_counters), so day-old rows can go. The old
--    1%-of-requests prune kept IPs for weeks at low traffic.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'olmene-prune-free-audits') then
    perform cron.unschedule('olmene-prune-free-audits');
  end if;
end $$;

select cron.schedule(
  'olmene-prune-free-audits',
  '17 * * * *',
  $cron$ delete from public.free_audits where created_at < now() - interval '1 day'; $cron$
);

-- 4. LLM model health (free-tier circuit breaker). When a provider answers
--    "quota exhausted" the engine benches that model until the quota resets
--    instead of spending a failed call on it in every step of every report.
--    Shared across all edge-function isolates. Service role only.
create table if not exists public.llm_model_health (
  model_id      text primary key,
  blocked_until timestamptz not null,
  reason        text,
  updated_at    timestamptz not null default now()
);
alter table public.llm_model_health enable row level security;
revoke all on public.llm_model_health from anon, authenticated;

-- 5. Ops events: failed jobs / fix runs land here (and optionally in a chat
--    webhook) so failures are visible without reading function logs.
create table if not exists public.ops_events (
  id         bigserial primary key,
  source     text not null,            -- 'analysis' | 'agent' | 'scan' | 'cron'
  severity   text not null default 'error',
  message    text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ops_events_created_idx on public.ops_events (created_at desc);
alter table public.ops_events enable row level security;
revoke all on public.ops_events from anon, authenticated;
