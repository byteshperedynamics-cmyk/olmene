#!/usr/bin/env python3
"""Remove all qa.bench.* test users and their data after pipeline benchmarks."""
import sys
sys.path.insert(0, "/home/z/my-project/scripts")
from db_query import q

users = q("select id, email from auth.users where email like 'qa.bench.%'")
if not users:
    print("no bench users found")
    raise SystemExit(0)
print(f"removing {len(users)} bench users")
for u in users:
    uid = u["id"]
    # any jobs still running? cancel first so the sweeper stops advancing them
    q(f"update analysis_jobs set status='canceled' where user_id='{uid}' and status in ('queued','running')")
    n_jobs = q(f"select count(*) as n from analysis_jobs where user_id='{uid}'")[0]["n"]
    n_reps = q(f"select count(*) as n from reports where user_id='{uid}'")[0]["n"] if True else 0
    q(f"delete from reports where user_id='{uid}'")
    q(f"delete from analysis_jobs where user_id='{uid}'")
    q(f"delete from report_credits where user_id='{uid}'")
    q(f"delete from subscriptions where user_id='{uid}'")
    q(f"delete from auth.users where id='{uid}'")
    print(f"  {u['email']}: removed {n_jobs} jobs, {n_reps} reports")

left = q("select count(*) as n from auth.users where email like 'qa.bench.%'")[0]["n"]
print(f"bench users remaining: {left}")
