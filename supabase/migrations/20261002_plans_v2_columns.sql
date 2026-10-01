-- v2 pricing dimensions (docs/design/IMPLEMENTATION_BRIEF.md §5E).
-- Additive and idempotent: new nullable/defaulted columns + a backfill of the
-- three existing plans. No row is inserted, deactivated or re-priced here —
-- the Fix/Team rows live in supabase/pending/ until their Polar product IDs
-- exist. The pricing page renders the current plans unchanged until then.

alter table public.plans add column if not exists slug text;
alter table public.plans add column if not exists billing_interval text;
alter table public.plans add column if not exists monthly_equivalent_eur numeric(10, 2);
alter table public.plans add column if not exists sites_limit int not null default 1;
alter table public.plans add column if not exists features_key text;

create unique index if not exists plans_slug_key on public.plans (slug) where slug is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plans_billing_interval_check') then
    alter table public.plans
      add constraint plans_billing_interval_check
      check (billing_interval is null or billing_interval in ('month', 'year', 'once'));
  end if;
end $$;

-- Backfill the live plans (matched by name, only where not yet set).
update public.plans
set slug = 'starter', billing_interval = 'month', monthly_equivalent_eur = 19
where name = 'Starter' and slug is null;

update public.plans
set slug = 'pro', billing_interval = 'month', monthly_equivalent_eur = 29
where name = 'Pro' and slug is null;

update public.plans
set slug = 'single-report', billing_interval = 'once', monthly_equivalent_eur = null
where name = 'Single Report' and slug is null;
