#!/usr/bin/env python3
"""Task 24 — functional test of the one-time report money path.
1. No sub, no credit -> start-analysis 402 (new message mentions credit option)
2. Insert credit -> start-analysis 200 -> credit claimed (job_id set)
3. Cancel the job -> credit becomes available again (dead-job logic)
4. create-checkout for the one-time product works while subscribed (guard skip)
5. create-checkout for a subscription product still blocks when subscribed
Cleanup: cancels/clears everything it created.
"""
import json
import sys
import urllib.request
import urllib.error

sys.path.insert(0, "/home/z/my-project/scripts")
from db_query import q

SB = "https://ffoevhldpppyfsfgufmx.supabase.co"
PUBKEY = "sb_publishable_CQJaLHGkc60GML5ccdWfdQ_8wO6PdTq"
sess = json.load(open("/tmp/money_session.json"))
TOKEN = sess["access_token"]
USER = json.load(open("/tmp/money_user.json"))["user_id"]
ONE_TIME = "67f74220-556e-4199-8f73-777bc3b61e13"
PRO = "9f1761be-8e0c-4eb0-8992-45aad45d9758"

def call(path, body):
    req = urllib.request.Request(
        SB + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "apikey": PUBKEY,
                 "Authorization": f"Bearer {TOKEN}"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")

ok = []
def check(name, cond, detail=""):
    ok.append(cond)
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  [{detail}]" if detail and not cond else ""))

# 1. No sub, no credit -> 402 with the new message
st, res = call("/functions/v1/start-analysis", {"siteUrl": "https://example.com", "goal": "grow_revenue"})
check("no sub/credit -> 402", st == 402, st)
check("402 mentions report credit", "report credit" in res.get("error", {}).get("message", ""), res)

# 2. Insert a credit -> start-analysis 200 + claimed
q(f"insert into report_credits (user_id, source, expires_at) values ('{USER}', 'qa-money-credit-1', now() + interval '90 days')")
st, res = call("/functions/v1/start-analysis", {"siteUrl": "https://example.com", "goal": "grow_revenue"})
check("with credit -> 200", st == 200, json.dumps(res)[:200])
job_id = res.get("jobId")
credit = q(f"select job_id from report_credits where source = 'qa-money-credit-1'")
check("credit claimed by job", bool(job_id) and bool(credit) and credit[0]["job_id"] == job_id, f"job={job_id} credit={credit}")

# 3. Cancel job -> credit available again (dead-job logic)
q(f"update analysis_jobs set status = 'canceled' where id = '{job_id}'")
avail = q(f"select id from report_credits where user_id = '{USER}' and job_id is null")
check("credit row keeps its claim (read-time logic frees it)", len(avail) == 0, avail)
# Simulate the entitlement read: available = unclaimed OR claimed-by-dead-job
ent = q(f"""
  select count(*) as n from report_credits c
  where c.user_id = '{USER}' and c.expires_at > now()
    and (c.job_id is null or c.job_id in (
      select id from analysis_jobs where status in ('failed','canceled')))
""")
check("entitlement counts dead-job credit as available", ent[0]["n"] == 1, ent)

# 4. Subscribed user CAN buy one-time (guard skip)
q(f"""insert into subscriptions (id, user_id, polar_subscription_id, polar_customer_id, polar_product_id, status, current_period_start, current_period_end, cancel_at_period_end, last_event_at, updated_at)
values (gen_random_uuid(), '{USER}', 'qa-money-sub-1', 'qa-cust', '{PRO}', 'active', now(), now() + interval '30 days', false, now(), now())""")
st, res = call("/functions/v1/create-checkout", {"productId": ONE_TIME})
check("one-time checkout allowed while subscribed", st == 200 and bool(res.get("url")), f"{st} {json.dumps(res)[:150]}")

# 5. Subscribed user still blocked from duplicate subscription
st, res = call("/functions/v1/create-checkout", {"productId": PRO})
check("subscription checkout still guarded", st == 200 and res.get("code") == "already_subscribed", f"{st} {json.dumps(res)[:150]}")

# Cleanup
q(f"delete from analysis_jobs where id = '{job_id}'")
q(f"delete from report_credits where user_id = '{USER}'")
q(f"delete from subscriptions where user_id = '{USER}'")
q(f"delete from auth.users where id = '{USER}'")
left = q(f"select count(*) as n from auth.users where id = '{USER}'")
check("cleanup complete", left[0]["n"] == 0, left)

print()
print(f"{sum(ok)}/{len(ok)} PASS" + ("" if all(ok) else "  — FAILURES ABOVE"))
sys.exit(0 if all(ok) else 1)
