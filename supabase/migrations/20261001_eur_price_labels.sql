-- Fix P2 (worklog Task 29): price labels showed "$" while Polar charges in EUR.
-- Render currency from the plan record — the label is the single source of truth.
update public.plans
set price_label = '€14 once'
where name = 'Single Report' and price_label = '$14 once';

update public.plans
set price_label = '€19 / month'
where name = 'Starter' and price_label = '$19 / month';

update public.plans
set price_label = '€29 / month'
where name = 'Pro' and price_label = '$29 / month';
