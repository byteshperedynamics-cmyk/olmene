-- PENDING — do not move into supabase/migrations/ until the owner has:
--   1. created these products in Polar (EUR):
--        Fix monthly   €49 / month
--        Fix yearly    €468 / year   (€39 / month equivalent)
--        Team monthly  €149 / month
--        Team yearly   €1,428 / year (€119 / month equivalent)
--        Single report €29 one-time
--   2. replaced every TODO(owner) below with the real Polar product IDs
--   3. decided whether Starter/Pro/Single(€14) stop being sold (step B).
--      Existing subscribers keep working either way: the webhook and the
--      entitlement read the subscription's polar_product_id, and inactive
--      plans stay in the table.
-- Then: git mv supabase/pending/20261002_plans_v2_rows.sql supabase/migrations/
-- (the push-to-main pipeline applies it via `supabase db push`).

-- A. New plans --------------------------------------------------------------
insert into public.plans
  (polar_product_id, name, reports_per_period, price_label, sort_order, active,
   one_time, actions_per_period, slug, billing_interval, monthly_equivalent_eur, sites_limit, features_key)
values
  ('TODO(owner): polar id fix monthly',  'Fix',  2, '€49 / month',   10, true, false, 10, 'fix',          'month', 49,   1, 'plan.fix'),
  ('TODO(owner): polar id fix yearly',   'Fix',  2, '€468 / year',   11, true, false, 10, 'fix-yearly',   'year',  39,   1, 'plan.fix'),
  ('TODO(owner): polar id team monthly', 'Team', 4, '€149 / month',  20, true, false, 30, 'team',         'month', 149,  5, 'plan.team'),
  ('TODO(owner): polar id team yearly',  'Team', 4, '€1,428 / year', 21, true, false, 30, 'team-yearly',  'year',  119,  5, 'plan.team'),
  ('TODO(owner): polar id single 29',    'Single Report', 1, '€29 once', 30, true, true, 0, 'single-report-29', 'once', null, 1, null)
on conflict (polar_product_id) do nothing;

-- B. Stop selling the old plans (owner decision) -----------------------------
update public.plans set active = false where slug in ('starter', 'pro', 'single-report');
