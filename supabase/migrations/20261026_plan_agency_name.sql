-- Plan rename (2026-10-29): "Team" is now "Agency". The plan is sold to
-- agencies (5 client sites, client pages, white-label reports), and "Team"
-- read as "a founder with co-workers". Only the display name changes: slugs
-- (team, team-yearly), Polar product ids, limits and features_key stay, so
-- entitlements, the trial (TRIAL_PLAN = "team") and checkout are unaffected.
-- The Polar product names are renamed by hand in the Polar dashboard.
--
-- Idempotent.

update public.plans
   set name = 'Agency'
 where slug in ('team', 'team-yearly')
   and name is distinct from 'Agency';
