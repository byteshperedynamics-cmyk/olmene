-- The parts of a Supabase database our migrations rely on, for testing them
-- on a plain Postgres (scripts/test-sql.mjs). Not a migration: never applied
-- to a real project.
--
-- auth.uid() reads the same request.jwt.claims setting PostgREST sets, so a
-- test can act as a user with:
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin nologin; end if;
end $$;

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;
create extension if not exists citext;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create schema if not exists cron;
create schema if not exists net;
create schema if not exists vault;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', 'anon')
$$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now()
);

-- pg_cron, pg_net and Vault: just enough surface for the migrations to load.
create table if not exists cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint language plpgsql as $$
declare id bigint;
begin
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid into id;
  return id;
end $$;
create or replace function cron.unschedule(job_name text) returns boolean language sql as $$
  delete from cron.job where jobname = job_name returning true
$$;
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
returns bigint language sql as $$ select 1::bigint $$;
create or replace function net.http_get(url text, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
returns bigint language sql as $$ select 1::bigint $$;
create table if not exists vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text);
create or replace view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid language sql as $$
  insert into vault.secrets (name, secret) values (new_name, new_secret) returning id
$$;

-- Supabase's defaults: the API roles get full table privileges and row
-- level security does the gatekeeping, so tests exercise the policies.
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt(), auth.role() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
