-- Client reports (2026-10-24): a short branded email per client, weekly or
-- monthly, with each of their sites' score and what changed, sent to people
-- the agency adds.
--
-- The monitor function queues one notification per recipient when a
-- client's report_next_at comes round (Mondays or the 1st, 08:00 UTC); the
-- notify function builds and sends it under the agency's name. Rows are
-- keyed by the workspace owner's user id like every agency table; members
-- read through readable_owner_ids() and change things through the Worker.
-- Additive and idempotent.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. How often each client gets one
-- ─────────────────────────────────────────────────────────────────────────
alter table public.clients add column if not exists report_cadence text not null default 'off';
alter table public.clients add column if not exists report_next_at timestamptz;  -- when the next one goes out (null when off)
alter table public.clients add column if not exists report_sent_at timestamptz;  -- when the last one went out
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_report_cadence') then
    alter table public.clients add constraint clients_report_cadence check (report_cadence in ('off', 'weekly', 'monthly'));
  end if;
end $$;
create index if not exists clients_report_due_idx on public.clients (report_next_at) where report_cadence <> 'off';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Who gets it
-- ─────────────────────────────────────────────────────────────────────────
-- Someone who unsubscribes stays listed (unsubscribed_at set), so adding the
-- same address again can't sign them back up.
create table if not exists public.client_recipients (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  client_id       uuid not null references public.clients(id) on delete cascade,
  email           text not null check (email = lower(btrim(email)) and char_length(email) <= 254 and email like '%_@_%.__%'),
  unsub_token     text not null unique
                  default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
                  check (unsub_token ~ '^[0-9a-f]{64}$'),
  unsubscribed_at timestamptz,
  added_by        uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (client_id, email)
);
create index if not exists client_recipients_user_idx on public.client_recipients (user_id);
alter table public.client_recipients enable row level security;
drop policy if exists client_recipients_workspace_read on public.client_recipients;
create policy client_recipients_workspace_read on public.client_recipients
  for select to authenticated using (user_id in (select public.readable_owner_ids()));
-- The unsubscribe token is the recipient's, not the agency's: browsers can
-- read every column but that one (only the service role sees it).
revoke all on public.client_recipients from anon, authenticated;
grant select (id, user_id, client_id, email, unsubscribed_at, added_by, created_at) on public.client_recipients to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Invitation links stay with whoever sent them
-- ─────────────────────────────────────────────────────────────────────────
-- A pending workspace_invite notification carries the invitation link until
-- notify sends it. Members read the owner's notifications (activity feed),
-- but not those rows; the owner still does ("own notifications").
drop policy if exists notifications_workspace_read on public.notifications;
create policy notifications_workspace_read on public.notifications
  for select to authenticated using (user_id in (select public.readable_owner_ids()) and kind <> 'workspace_invite');
