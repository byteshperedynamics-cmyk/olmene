-- Public metrics (docs/design/IMPLEMENTATION_BRIEF.md §6.5). Additive.
-- public_stats() returns AGGREGATES ONLY plus an anonymized fix feed; a site
-- appears in the feed only when its owner opted in. Execute is limited to
-- the service role (called by GET /api/public/stats/). MRR history comes from
-- real weekly snapshots, never recomputed after the fact.

alter table public.connections add column if not exists public_feed_opt_in boolean not null default false;

create table if not exists public.metrics_weekly (
  week_start  date primary key,
  mrr_eur     numeric(12, 2) not null,
  active_subs int not null,
  prs_merged  int not null,
  created_at  timestamptz not null default now()
);
alter table public.metrics_weekly enable row level security; -- service role only (no policies)

create or replace function public.current_mrr_eur()
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(p.monthly_equivalent_eur), 0)
    from public.subscriptions s
    join public.plans p on p.polar_product_id = s.polar_product_id
   where s.status in ('active', 'trialing')
     and coalesce(p.billing_interval, 'month') <> 'once';
$$;

create or replace function public.snapshot_metrics_weekly()
returns void language sql volatile security definer set search_path = public as $$
  insert into public.metrics_weekly (week_start, mrr_eur, active_subs, prs_merged)
  select date_trunc('week', now())::date,
         public.current_mrr_eur(),
         (select count(*) from public.subscriptions where status in ('active', 'trialing')),
         (select count(*) from public.agent_jobs where pr_state = 'merged')
  on conflict (week_start) do update
    set mrr_eur = excluded.mrr_eur, active_subs = excluded.active_subs, prs_merged = excluded.prs_merged;
$$;

-- plpgsql: tables are resolved at call time (free_audits was created outside
-- the migration history, so a SQL-language body would fail on a fresh DB).
create or replace function public.public_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'free_scans', (select count(*) from public.free_audits),
    'reports', (select count(*) from public.reports),
    'sources_cited', (select coalesce(sum(jsonb_array_length(coalesce(data -> 'sources', '[]'::jsonb))), 0) from public.reports),
    'prs_opened', (select count(*) from public.agent_jobs where pr_number is not null),
    'prs_merged', (select count(*) from public.agent_jobs where pr_state = 'merged'),
    'sites_monitored', (select count(distinct user_id) from public.connections where status = 'active' and provider in ('github', 'google')),
    'measured_outcomes', (select count(*) from public.fix_outcomes where status in ('measured', 'combined')),
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
           order by j.merged_at desc
           limit 20
        ) f
    ), '[]'::jsonb),
    'generated_at', now()
  );
end;
$$;

revoke all on function public.public_stats() from public, anon, authenticated;
revoke all on function public.snapshot_metrics_weekly() from public, anon, authenticated;
revoke all on function public.current_mrr_eur() from public, anon, authenticated;

-- Weekly snapshot, Mondays 00:05 UTC (pure SQL — no secrets involved).
select cron.schedule('olmene-metrics-weekly', '5 0 * * 1', $cron$ select public.snapshot_metrics_weekly(); $cron$);
