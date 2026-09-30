#!/usr/bin/env python3
"""Task 24 — one-time report support: DB migration.
1. plans.one_time flag (subscription vs one-off product)
2. report_credits table (one purchase = 1 credit, claimed by a job)
3. RLS: users can SELECT their own credits; writes are service-role only
"""
import sys
sys.path.insert(0, "/home/z/my-project/scripts")
from db_query import q

MIGRATIONS = [
    # 1. plans.one_time
    """alter table public.plans add column if not exists one_time boolean not null default false""",
    # 2. report_credits
    """
    create table if not exists public.report_credits (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      source text not null unique,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      job_id uuid
    )
    """,
    """create index if not exists report_credits_user_idx on public.report_credits (user_id) where job_id is null""",
    # 3. RLS — mirror the subscriptions pattern (own SELECT only)
    """alter table public.report_credits enable row level security""",
    """drop policy if exists "own report credits" on public.report_credits""",
    """create policy "own report credits" on public.report_credits for select using (auth.uid() = user_id)""",
]

for m in MIGRATIONS:
    r = q(m)
    print("OK " if not r else "WARN ", m.strip().splitlines()[0][:80], str(r)[:150] if r else "")
