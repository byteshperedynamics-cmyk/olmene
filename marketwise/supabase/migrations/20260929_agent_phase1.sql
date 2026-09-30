-- MarketWise Agent — Phase 1 schema (GitHub PR fixer)
-- Applied 2026-09-29 via Supabase Management API. Additive only; feature-flagged off by default.
-- Policy discipline matches the rest of the app (audit §3.2):
--   * RLS enabled on every table
--   * users get SELECT-own policies only — NO user-role INSERT/UPDATE/DELETE anywhere
--   * every write flows through server code holding the service role key

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. connections — one row per user↔provider authorization
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.connections (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  provider                text not null check (provider in ('github', 'cloudflare', 'supabase')),
  status                  text not null default 'active'
                          check (status in ('active', 'disconnected', 'revoked', 'expired')),
  -- provider identity (non-secret)
  provider_account_id     text,                          -- e.g. GitHub account login of the installer
  external_installation_id text,                          -- e.g. GitHub installation_id
  resource_ids            jsonb not null default '[]',   -- discovered repos (allowlist source)
  scopes                  jsonb not null default '[]',
  metadata                jsonb not null default '{}',   -- provider-specific non-secret info
  -- secret material (envelope-encrypted; DEK wrapped by MW_KMS_MASTER_KEY, which lives ONLY in Worker env).
  -- GitHub v1 stores nothing here (installation tokens are minted on demand and never persisted).
  secret_ciphertext       text,
  secret_dek_ciphertext   text,
  secret_algo             text default 'AES-GCM-256',
  secret_expires_at       timestamptz,
  last_verified_at        timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create unique index if not exists connections_user_provider_install
  on public.connections (user_id, provider, coalesce(external_installation_id, ''));
create index if not exists connections_user_idx on public.connections (user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. agent_app_config — org-level provider app credentials (e.g. the GitHub App itself)
--    Secrets are envelope-encrypted with the env master key. Never user-writable.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.agent_app_config (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null,
  name                text not null,                    -- 'app_id', 'client_id' (plain) / 'private_key', 'client_secret' (encrypted)
  is_secret           boolean not null default true,
  value_text          text,                             -- used when is_secret = false
  value_ciphertext    text,                             -- used when is_secret = true
  value_dek_ciphertext text,
  metadata            jsonb not null default '{}',      -- e.g. { app_slug, html_url, created_via: 'manifest'|'manual' }
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (provider, name)
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. agent_oauth_states — short-lived nonces binding an OAuth round-trip to a MarketWise user
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.agent_oauth_states (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  flow           text not null,                          -- 'github-connect' | 'github-manifest'
  state          text not null unique,
  payload        jsonb not null default '{}',            -- discovered installations, etc. (non-secret)
  expires_at     timestamptz not null,
  consumed_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists agent_oauth_states_user_idx on public.agent_oauth_states (user_id, flow);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. agent_jobs — the Plan → Preview → Approval → Apply → Verify → Receipt state machine
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.agent_jobs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  report_id      uuid references public.reports(id) on delete set null,
  connection_id  uuid references public.connections(id) on delete set null,
  provider       text not null default 'github',
  status         text not null default 'queued'
                 check (status in ('queued','planning','previewing','awaiting_approval',
                                   'applying','verifying','completed','failed','canceled','killed')),
  current_step   text,
  input          jsonb not null default '{}',            -- { targetRepo, reportSnapshotRef, options }
  step_outputs   jsonb not null default '{}',
  error          text,
  wait_reason    text,
  locked_until   timestamptz,
  attempts       int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  completed_at   timestamptz
);
create index if not exists agent_jobs_user_idx on public.agent_jobs (user_id, created_at desc);
create index if not exists agent_jobs_active_idx on public.agent_jobs (user_id)
  where status in ('queued','planning','previewing','applying','verifying');

-- ───────────────────────────────────────────────────────────────────────────
-- 5. planned_actions — one row per proposed fix
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.planned_actions (
  id              uuid primary key default gen_random_uuid(),
  agent_job_id    uuid not null references public.agent_jobs(id) on delete cascade,
  fixer_id        text not null,                          -- 'meta-description', 'json-ld', …
  finding_ref     jsonb not null default '{}',            -- { checkLabel?, findingTitle?, reportScores }
  action_class    text not null default 'reversible_write'
                  check (action_class in ('read','reversible_write','destructive')),
  target          jsonb not null default '{}',            -- { repo, owner, path, branch }
  preview         jsonb,                                  -- { before, after, diff, explanation, evidence, expectedScoreChange, revertSteps }
  status          text not null default 'planned'
                  check (status in ('planned','skipped','approved','rejected','applied','failed','rolled_back')),
  skip_reason     text,
  apply_result    jsonb,                                  -- { prUrl, prNumber, commitSha }
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists planned_actions_job_idx on public.planned_actions (agent_job_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. approvals — the human gate (spec: every write requires explicit approval)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.approvals (
  id                uuid primary key default gen_random_uuid(),
  agent_job_id      uuid not null references public.agent_jobs(id) on delete cascade,
  planned_action_ids jsonb not null,                     -- uuid[] (batch or single)
  decision          text not null check (decision in ('approved','rejected')),
  decided_by        uuid not null,
  decided_at        timestamptz not null default now(),
  note              text
);
create index if not exists approvals_job_idx on public.approvals (agent_job_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 7. agent_actions — append-only audit log (who/what/target/hashes/result).
--    Compensating rows only; history is never edited.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.agent_actions (
  id                uuid primary key default gen_random_uuid(),
  agent_job_id      uuid references public.agent_jobs(id) on delete set null,
  planned_action_id uuid references public.planned_actions(id) on delete set null,
  user_id           uuid not null,
  actor             text not null default 'agent' check (actor in ('agent','user','system')),
  action_type       text not null,                       -- connect|plan|preview|approve|apply|verify|rollback|disconnect|kill|quota_block
  provider          text,
  target            jsonb,                               -- redacted descriptor, never tokens
  result            text not null check (result in ('success','failure','blocked','skipped')),
  before_hash       text,
  after_hash        text,
  detail            jsonb,                               -- redacted payload (scrubbed by redact.ts)
  created_at        timestamptz not null default now()
);
create index if not exists agent_actions_user_idx on public.agent_actions (user_id, created_at desc);
create index if not exists agent_actions_job_idx on public.agent_actions (agent_job_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 8. revocations — proof that access ended (spec: no unprovable revocation)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.revocations (
  id             uuid primary key default gen_random_uuid(),
  connection_id  uuid not null references public.connections(id) on delete cascade,
  user_id        uuid not null,
  method         text not null check (method in ('uninstall','connection_delete','manual','token_delete')),
  verified       boolean not null default false,
  verification   jsonb,                                  -- { checkedAt, attempt, httpStatus, evidence, manualSteps }
  created_at     timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- 9. receipts — user-facing record of everything the agent did + undo steps
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.receipts (
  id            uuid primary key default gen_random_uuid(),
  agent_job_id  uuid not null references public.agent_jobs(id) on delete cascade,
  user_id       uuid not null,
  format        text not null default 'md',
  content       text not null,
  created_at    timestamptz not null default now()
);
create index if not exists receipts_job_idx on public.receipts (agent_job_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 10. agent_flags — global + per-provider kill switches (flippable without deploy)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.agent_flags (
  key        text primary key,                            -- 'global_kill_switch', 'provider_github_enabled'
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.agent_flags (key, value, updated_by) values
  ('global_kill_switch', 'false'::jsonb, 'migration'),
  ('provider_github_enabled', 'true'::jsonb, 'migration')
on conflict (key) do nothing;

-- ───────────────────────────────────────────────────────────────────────────
-- 11. plans: action quota dimension (user decision: Starter 10 / Pro 30, 1 PR = 1 action)
-- ───────────────────────────────────────────────────────────────────────────
alter table public.plans add column if not exists actions_per_period int not null default 0;
update public.plans set actions_per_period = 10
  where polar_product_id = '7e27d794-9e05-463b-82e3-44016c3e1495';   -- Starter
update public.plans set actions_per_period = 30
  where polar_product_id = '9f1761be-8e0c-4eb0-8992-45aad45d9758';   -- Pro
-- Single Report / free: stays 0 → plan + preview only

-- ───────────────────────────────────────────────────────────────────────────
-- RLS — enable everywhere, SELECT-own for users, service-role-only writes
-- ───────────────────────────────────────────────────────────────────────────
alter table public.connections        enable row level security;
alter table public.agent_app_config   enable row level security;
alter table public.agent_oauth_states enable row level security;
alter table public.agent_jobs         enable row level security;
alter table public.planned_actions    enable row level security;
alter table public.approvals          enable row level security;
alter table public.agent_actions      enable row level security;
alter table public.revocations        enable row level security;
alter table public.receipts           enable row level security;
alter table public.agent_flags        enable row level security;

drop policy if exists "own connections" on public.connections;
create policy "own connections" on public.connections
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own agent jobs" on public.agent_jobs;
create policy "own agent jobs" on public.agent_jobs
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own planned actions" on public.planned_actions;
create policy "own planned actions" on public.planned_actions
  for select to authenticated
  using (exists (select 1 from public.agent_jobs j
                 where j.id = planned_actions.agent_job_id and j.user_id = auth.uid()));

drop policy if exists "own approvals" on public.approvals;
create policy "own approvals" on public.approvals
  for select to authenticated
  using (exists (select 1 from public.agent_jobs j
                 where j.id = approvals.agent_job_id and j.user_id = auth.uid()));

drop policy if exists "own agent actions" on public.agent_actions;
create policy "own agent actions" on public.agent_actions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own revocations" on public.revocations;
create policy "own revocations" on public.revocations
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own receipts" on public.receipts;
create policy "own receipts" on public.receipts
  for select to authenticated using (user_id = auth.uid());

-- agent_app_config, agent_oauth_states, agent_flags: NO user policies at all
-- (service-role only — they hold org credentials and internal state)

commit;
