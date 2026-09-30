-- Marketwise — pg_cron sweeper schedule (spec §6, 0002_cron.sql)
-- The sweeper calls the `sweeper` Edge Function every minute with the
-- x-cron-secret header. The base URL and secret live in Supabase Vault.
-- OWNER ACTION (see HANDOFF.md): after linking the project, replace the two
-- vault secrets below with real values, then re-run this schedule statement.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- Create the secrets only if they do not exist yet (idempotent-ish; on
-- conflict the extra row is harmless because we read by name + latest).
insert into vault.secrets (secret, name)
select 'https://REPLACE_PROJECT_REF.supabase.co/functions/v1', 'functions_base_url'
where not exists (select 1 from vault.secrets where name = 'functions_base_url');

insert into vault.secrets (secret, name)
select 'REPLACE_WITH_STRONG_RANDOM_SECRET', 'cron_secret'
where not exists (select 1 from vault.secrets where name = 'cron_secret');

-- Small helper so the cron expression stays readable.
create or replace function public.vault_secret(p_name text)
returns text language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret
    from vault.decrypted_secrets
   where name = p_name
   order by id desc
   limit 1;
$$;
revoke all on function public.vault_secret(text) from public, anon, authenticated;

-- Every minute: POST {} to <base>/sweeper with the cron secret header.
select cron.schedule(
  'sweep-jobs',
  '* * * * *',
  $cron$
  select net.http_post(
    url := public.vault_secret('functions_base_url') || '/sweeper',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.vault_secret('cron_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
