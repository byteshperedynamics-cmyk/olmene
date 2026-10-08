-- Launch fixes (2026-10-08). Additive and idempotent.

-- 1. Plans are public price data. The read policy exposed ACTIVE plans only,
--    so a subscriber on a retired plan could not read their own plan and the
--    dashboard showed "Subscribed plan · Unlimited" with no quota. Every row
--    is readable now; the app filters `active` where it lists plans for sale.
drop policy if exists "public plans" on public.plans;
drop policy if exists "plans are public" on public.plans;
create policy "plans are public" on public.plans for select using (true);

-- 2. Test accounts. QA and E2E runs left rows in production that counted in
--    the public numbers on /open (two "fix PRs" were jobs against a local
--    GitHub mock) and in MRR (a bypass subscription). A flag keeps them out
--    without deleting history. Only throwaway-inbox domains are flagged here.
alter table public.profiles add column if not exists is_test boolean not null default false;

update public.profiles
   set is_test = true
 where not is_test
   and (email ilike '%@ztestmail.dev' or email ilike '%@mailinator.com' or email ilike '%@uberip.com');

create or replace function public.is_test_user(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_test from public.profiles where id = uid), false);
$$;
revoke execute on function public.is_test_user(uuid) from public, anon, authenticated;

create or replace function public.current_mrr_eur()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(p.monthly_equivalent_eur), 0)
    from public.subscriptions s
    join public.plans p on p.polar_product_id = s.polar_product_id
   where s.status in ('active', 'trialing')
     and coalesce(p.billing_interval, 'month') <> 'once'
     and not public.is_test_user(s.user_id);
$$;

create or replace function public.public_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return jsonb_build_object(
    -- Cumulative: free_audits doubles as the rate-limit log and is pruned
    -- after a day, so counting its rows made the public number shrink.
    'free_scans', coalesce((select value from public.stat_counters where key = 'free_scans'), 0),
    'reports', (select count(*) from public.reports r where not public.is_test_user(r.user_id)),
    'sources_cited', (
      select coalesce(sum(jsonb_array_length(coalesce(r.data -> 'sources', '[]'::jsonb))), 0)
        from public.reports r
       where not public.is_test_user(r.user_id)
    ),
    'prs_opened', (select count(*) from public.agent_jobs j where j.pr_number is not null and not public.is_test_user(j.user_id)),
    'prs_merged', (select count(*) from public.agent_jobs j where j.pr_state = 'merged' and not public.is_test_user(j.user_id)),
    'sites_monitored', (
      select count(distinct c.user_id) from public.connections c
       where c.status = 'active' and c.provider in ('github', 'google') and not public.is_test_user(c.user_id)
    ),
    'measured_outcomes', (
      select count(*) from public.fix_outcomes o
       where o.status in ('measured', 'combined') and not public.is_test_user(o.user_id)
    ),
    'mrr_eur', public.current_mrr_eur(),
    'mrr_weeks', coalesce((
      select jsonb_agg(jsonb_build_object('week', week_start, 'mrr', mrr_eur) order by week_start)
        from (select * from public.metrics_weekly order by week_start desc limit 12) w
    ), '[]'::jsonb),
    'feed', coalesce((
      select jsonb_agg(f order by f.merged_at desc)
        from (
          select j.merged_at,
                 (select coalesce(jsonb_agg(distinct pa.fixer_id), '[]'::jsonb)
                    from public.planned_actions pa
                   where pa.agent_job_id = j.id and pa.status = 'applied') as fixers,
                 case when exists (
                   select 1 from public.connections c
                    where c.id = j.connection_id and c.public_feed_opt_in
                 ) then j.input ->> 'targetRepo' else null end as repo
            from public.agent_jobs j
           where j.pr_state = 'merged' and j.merged_at is not null
             and not public.is_test_user(j.user_id)
           order by j.merged_at desc
           limit 20
        ) f
    ), '[]'::jsonb),
    'generated_at', now()
  );
end;
$$;

-- 3. Sweeper: pg_net's default 5 s timeout cut the call short at the top of
--    every hour. Same schedule and command, with the 30 s timeout agent sync
--    already uses.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sweep-jobs') then
    perform cron.unschedule('sweep-jobs');
  end if;
end $$;

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
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);
