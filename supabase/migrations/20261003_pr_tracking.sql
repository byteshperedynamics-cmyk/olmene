-- PR merge tracking (docs/design/IMPLEMENTATION_BRIEF.md §6.3).
-- Additive and idempotent. The runner sets pr_number/pr_url/pr_state='open'
-- when it opens a PR; POST /api/cron/sync/ polls GitHub (GET only) and moves
-- open PRs to 'merged' (with merged_at) or 'closed'. Feeds the merge rate,
-- impact-chart markers and public stats. Backfill of existing PRs happens on
-- the first sync from step_outputs.apply.

alter table public.agent_jobs add column if not exists pr_number int;
alter table public.agent_jobs add column if not exists pr_url text;
alter table public.agent_jobs add column if not exists pr_state text;
alter table public.agent_jobs add column if not exists merged_at timestamptz;
alter table public.agent_jobs add column if not exists pr_last_polled_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agent_jobs_pr_state_check') then
    alter table public.agent_jobs
      add constraint agent_jobs_pr_state_check
      check (pr_state is null or pr_state in ('open', 'merged', 'closed'));
  end if;
end $$;

create index if not exists agent_jobs_open_prs_idx
  on public.agent_jobs (pr_last_polled_at nulls first)
  where pr_state = 'open';

-- Backfill: jobs that already opened a PR before this column existed.
update public.agent_jobs
set pr_number = (step_outputs -> 'apply' ->> 'prNumber')::int,
    pr_url = step_outputs -> 'apply' ->> 'prUrl',
    pr_state = 'open'
where pr_number is null
  and step_outputs -> 'apply' ->> 'prNumber' is not null;
