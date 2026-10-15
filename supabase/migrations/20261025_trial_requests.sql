-- Trial requests (2026-10-25): companies and agencies ask for 14 days of the
-- Team plan on /business/. The Worker stores each request; the notify
-- function emails it to Olmene's inbox (notify_to, from SUPPORT_EMAIL in
-- src/lib/config.ts) with Reply-To the person who asked, and someone replies
-- within one working day.
--
-- Nobody reads these from a browser: RLS on, no policies, no grants.
-- Additive and idempotent.

create table if not exists public.trial_requests (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(btrim(name)) between 1 and 100),
  email          text not null check (email = lower(btrim(email)) and char_length(email) <= 254 and email like '%_@_%.__%'),
  company        text not null check (char_length(btrim(company)) between 1 and 120),
  website        text not null check (char_length(website) <= 300 and website ~ '^https?://[^\s]+$'),
  kind           text not null check (kind in ('company', 'agency')),
  team_size      text check (team_size in ('1', '2-5', '6-20', '21+')),
  note           text check (note is null or char_length(note) <= 1000),
  language       text check (language is null or language ~ '^[a-z]{2}(-[A-Za-z]{2})?$'),
  -- Set when the person was signed in: the account to turn the trial on for.
  user_id        uuid references auth.users(id) on delete set null,
  -- sha256 of the address and the day, for rate limits; never the address itself.
  ip_hash        text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  status         text not null default 'new' check (status in ('new', 'contacted', 'trial_started', 'declined', 'spam')),
  notify_to      text check (notify_to is null or notify_to like '%_@_%.__%'),
  notified_at    timestamptz,
  notify_attempts int not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists trial_requests_unsent_idx on public.trial_requests (created_at) where notified_at is null;
create index if not exists trial_requests_ip_idx on public.trial_requests (ip_hash, created_at);
create index if not exists trial_requests_email_idx on public.trial_requests (email, created_at);
alter table public.trial_requests enable row level security;
revoke all on public.trial_requests from anon, authenticated;
