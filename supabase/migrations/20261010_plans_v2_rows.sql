-- Plans v2: the fix-based catalog, sold through the new Polar organization
-- (ByteSphere_Dynamics, EUR). Product IDs created 2026-10-02.
--   Fix €49/mo · Fix €468/yr · Team €149/mo · Team €1,428/yr · Single report €29
-- Old Starter/Pro/€14 rows belong to the previous Polar account; they are kept
-- (inactive) so existing subscription rows still resolve a plan name, but they
-- are no longer offered. Idempotent: re-running inserts nothing new.

-- A. New plans --------------------------------------------------------------
insert into public.plans
  (polar_product_id, name, reports_per_period, price_label, sort_order, active,
   one_time, actions_per_period, slug, billing_interval, monthly_equivalent_eur, sites_limit, features_key)
values
  ('270fb54c-68cf-40dd-8148-fd0d6cc27da4',  'Fix',  2, '€49 / month',   10, true, false, 10, 'fix',          'month', 49,   1, 'plan.fix'),
  ('5b348aa2-9e5e-4f2e-bcd0-4852f094d1bf',   'Fix',  2, '€468 / year',   11, true, false, 10, 'fix-yearly',   'year',  39,   1, 'plan.fix'),
  ('9d62c479-e963-49d9-a315-0273b3d61663', 'Team', 4, '€149 / month',  20, true, false, 30, 'team',         'month', 149,  5, 'plan.team'),
  ('99e8fc86-6bd8-4512-ae2e-11bb0bfbffe6',  'Team', 4, '€1,428 / year', 21, true, false, 30, 'team-yearly',  'year',  119,  5, 'plan.team'),
  ('1256adbe-93a0-4823-afa1-7f16bde61bbc',    'Single Report', 1, '€29 once', 30, true, true, 0, 'single-report-29', 'once', null, 1, null)
on conflict (polar_product_id) do nothing;

-- B. Stop selling the old plans (owner decision) -----------------------------
update public.plans set active = false where slug in ('starter', 'pro', 'single-report');
