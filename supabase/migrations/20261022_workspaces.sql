-- Workspaces (2026-10-22): shared accounts for companies and agencies.
--
-- A workspace is an account that pays: its owner's plan, sites, reports,
-- fixes and connections. People join by invitation with a role:
--   owner  — plan, billing and everything else (exactly one: workspaces.owner_id)
--   admin  — manages the team and connections, does every kind of work
--   member — runs scans, reports and fixes
--   viewer — reads everything, changes nothing
--
-- Data stays keyed by the owner's user id (the existing user_id columns), so
-- the engine, quotas and billing don't change. Members read through the
-- policies below and act through the Worker and edge functions, which check
-- their role (src/lib/workspace/, supabase/functions/_shared/workspace.ts).
--
-- Additive and idempotent: new tables, functions and extra read policies;
-- nothing existing is dropped or changed. Safe to run twice.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null unique references auth.users(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  kind        text not null default 'company' check (kind in ('company', 'agency')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.workspaces enable row level security;

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  invited_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user_idx on public.workspace_members (user_id);
create unique index if not exists workspace_members_one_owner on public.workspace_members (workspace_id) where role = 'owner';
alter table public.workspace_members enable row level security;

-- The link in an invitation carries a random token; only its SHA-256 is stored.
create table if not exists public.workspace_invites (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email        text not null check (email = lower(btrim(email)) and email like '%_@_%.__%'),
  role         text not null check (role in ('admin', 'member', 'viewer')),
  token_hash   text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  invited_by   uuid references auth.users(id) on delete set null,
  expires_at   timestamptz not null default now() + interval '14 days',
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index if not exists workspace_invites_open on public.workspace_invites (workspace_id, email) where accepted_at is null;
alter table public.workspace_invites enable row level security; -- no policies: Worker only

-- Who started a report or a fix run (the account is still user_id). Null for
-- older rows and for runs started by the schedule.
alter table public.analysis_jobs add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.agent_jobs add column if not exists created_by uuid references auth.users(id) on delete set null;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Helpers (security definer, so policies don't recurse into each other)
-- ─────────────────────────────────────────────────────────────────────────

-- Workspaces the signed-in person belongs to.
create or replace function public.my_workspace_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select workspace_id from public.workspace_members where user_id = auth.uid()
$$;

-- Accounts whose data the signed-in person may read: their own, plus the
-- owner of every workspace they belong to.
create or replace function public.readable_owner_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select auth.uid() where auth.uid() is not null
  union
  select w.owner_id
    from public.workspace_members m
    join public.workspaces w on w.id = m.workspace_id
   where m.user_id = auth.uid()
$$;

revoke all on function public.my_workspace_ids() from public, anon;
revoke all on function public.readable_owner_ids() from public, anon;
grant execute on function public.my_workspace_ids() to authenticated, service_role;
grant execute on function public.readable_owner_ids() to authenticated, service_role;

-- A person's role on an owner's data: 'owner' for their own account, their
-- membership role in the owner's workspace, or null. Worker / edge functions only.
create or replace function public.workspace_role(p_owner uuid, p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when p_owner is null or p_user is null then null
    when p_owner = p_user then 'owner'
    else (select m.role
            from public.workspace_members m
            join public.workspaces w on w.id = m.workspace_id
           where w.owner_id = p_owner and m.user_id = p_user)
  end
$$;
revoke all on function public.workspace_role(uuid, uuid) from public, anon, authenticated;
grant execute on function public.workspace_role(uuid, uuid) to service_role;

-- The owner's workspace, created on first use with the owner as its first member.
create or replace function public.ensure_workspace(p_owner uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  select id into ws from public.workspaces where owner_id = p_owner;
  if ws is null then
    insert into public.workspaces (owner_id, name)
    values (p_owner, coalesce(nullif(left(btrim(p_name), 80), ''), 'My workspace'))
    on conflict (owner_id) do nothing
    returning id into ws;
    if ws is null then
      select id into ws from public.workspaces where owner_id = p_owner;
    end if;
  end if;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (ws, p_owner, 'owner')
  on conflict (workspace_id, user_id) do nothing;
  return ws;
end $$;
revoke all on function public.ensure_workspace(uuid, text) from public, anon, authenticated;
grant execute on function public.ensure_workspace(uuid, text) to service_role;

-- Accepting an invitation, in one transaction: the link must be open, not
-- expired, and addressed to the email of the person accepting it. Someone
-- who is already a member keeps their current role. Returns the workspace id,
-- or raises: invite_not_found, invite_used, invite_expired, invite_email.
create or replace function public.accept_workspace_invite(p_token_hash text, p_user uuid, p_email text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.workspace_invites%rowtype;
begin
  select * into inv from public.workspace_invites where token_hash = p_token_hash for update;
  if not found then raise exception 'invite_not_found'; end if;
  if inv.accepted_at is not null then raise exception 'invite_used'; end if;
  if inv.expires_at < now() then raise exception 'invite_expired'; end if;
  if inv.email <> lower(btrim(coalesce(p_email, ''))) then raise exception 'invite_email'; end if;
  insert into public.workspace_members (workspace_id, user_id, role, invited_by)
  values (inv.workspace_id, p_user, inv.role, inv.invited_by)
  on conflict (workspace_id, user_id) do nothing;
  update public.workspace_invites set accepted_at = now(), accepted_by = p_user where id = inv.id;
  return inv.workspace_id;
end $$;
revoke all on function public.accept_workspace_invite(text, uuid, text) from public, anon, authenticated;
grant execute on function public.accept_workspace_invite(text, uuid, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Who can read what
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists workspaces_members_read on public.workspaces;
create policy workspaces_members_read on public.workspaces
  for select to authenticated using (id in (select public.my_workspace_ids()));

drop policy if exists workspace_members_same_read on public.workspace_members;
create policy workspace_members_same_read on public.workspace_members
  for select to authenticated using (workspace_id in (select public.my_workspace_ids()));

-- Members read the workspace's data. These sit beside the existing
-- "own rows" policies (Postgres ORs them), so nothing changes for anyone
-- who isn't in a shared workspace. Connections, revocations and secrets
-- stay owner-only: the Worker shows members what they need from those.
do $$
declare t text;
begin
  foreach t in array array[
    'subscriptions', 'analysis_jobs', 'reports', 'sites', 'notifications',
    'agent_jobs', 'agent_actions', 'receipts', 'gsc_daily', 'fix_outcomes',
    'guided_runs', 'ai_visibility_runs', 'pr_checks', 'progress_shares', 'report_credits'
  ] loop
    -- report_credits exists in production but predates these migrations
    continue when to_regclass('public.' || t) is null;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_workspace_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id in (select public.readable_owner_ids()))',
      t || '_workspace_read', t);
  end loop;
end $$;

drop policy if exists planned_actions_workspace_read on public.planned_actions;
create policy planned_actions_workspace_read on public.planned_actions
  for select to authenticated using (exists (
    select 1 from public.agent_jobs j
     where j.id = planned_actions.agent_job_id and j.user_id in (select public.readable_owner_ids())));

drop policy if exists approvals_workspace_read on public.approvals;
create policy approvals_workspace_read on public.approvals
  for select to authenticated using (exists (
    select 1 from public.agent_jobs j
     where j.id = approvals.agent_job_id and j.user_id in (select public.readable_owner_ids())));
