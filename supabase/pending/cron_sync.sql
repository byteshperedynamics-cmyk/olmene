-- PENDING — schedules POST https://olmene.com/api/cron/sync/ every 15 minutes
-- (PR merge tracking today; Search Console sync later). Do not move into
-- supabase/migrations/ until the owner has:
--   1. generated a random secret of at least 32 characters, e.g.
--        openssl rand -base64 48
--   2. set it on the Worker:   npx wrangler secret put OLMENE_CRON_SECRET
--   3. stored the SAME value in Supabase Vault under the name 'olmene_cron_secret'
--      (Dashboard → Project Settings → Vault, or SQL:
--        select vault.create_secret('<value>', 'olmene_cron_secret');)
-- The value itself never goes in git. Then move this file to
-- supabase/migrations/ with a version newer than the latest one.
-- Reuses public.vault_secret() from 0002_cron.sql.

select cron.schedule(
  'olmene-sync',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://olmene.com/api/cron/sync/',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.vault_secret('olmene_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $cron$
);
