-- Cumulative free-scan counter (2026-10-02).
-- public_stats() counted rows in free_audits, but that table is the scanner's
-- rate-limit log and the free-audit function deletes rows older than a day, so
-- the "free scans run" number on the homepage and /open went DOWN over time.
-- A trigger now increments a counter that nothing prunes. Idempotent.

create table if not exists public.stat_counters (
  key text primary key,
  value bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.stat_counters enable row level security; -- service role only

create or replace function public.bump_free_scan_counter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.stat_counters (key, value) values ('free_scans', 1)
  on conflict (key) do update set value = public.stat_counters.value + 1, updated_at = now();
  return null;
end;
$$;
revoke all on function public.bump_free_scan_counter() from public, anon, authenticated;

-- free_audits was created outside the migration history: guard every use.
do $$
begin
  if to_regclass('public.free_audits') is not null then
    -- Seed once from what the log still holds (pruned history is gone).
    insert into public.stat_counters (key, value)
    select 'free_scans', count(*) from public.free_audits
    on conflict (key) do nothing;
    drop trigger if exists free_audits_bump_counter on public.free_audits;
    create trigger free_audits_bump_counter
      after insert on public.free_audits
      for each row execute function public.bump_free_scan_counter();
  else
    insert into public.stat_counters (key, value) values ('free_scans', 0) on conflict (key) do nothing;
  end if;
end;
$$;

create or replace function public.public_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object(
    -- Cumulative: free_audits doubles as the rate-limit log and is pruned
    -- after a day, so counting its rows made the public number shrink.
    'free_scans', coalesce((select value from public.stat_counters where key = 'free_scans'), 0),
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
