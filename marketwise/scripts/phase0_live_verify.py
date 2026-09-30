#!/usr/bin/env python3
"""Phase 0 live-state verification for the architecture audit.

Checks (read-only) against production Supabase via the Management API:
  1. Deployed edge functions (slug, verify_jwt, status, updated_at)
  2. Public schema tables + RLS enabled/forced status
  3. Row policies per table
  4. pg_cron schedules
  5. llm_models routing table
  6. Helper RPCs (claim_job / consume_budget)
  7. anon/authenticated grants on public tables
  8. Row-count scale of key tables
  9. Fresh fetch of deployed advance-analysis / polar-webhook / start-analysis
     bodies, grepped for generation markers (drift check)
"""
import json, os, re, urllib.request, urllib.error

PAT = "sbp_REDACTED_FOR_EXPORT"
REF = "ffoevhldpppyfsfgufmx"
API = f"https://api.supabase.com/v1/projects/{REF}"
OUT_DIR = "/home/z/my-project/scratch/live-fns"
os.makedirs(OUT_DIR, exist_ok=True)


def req(url, timeout=90, binary=False):
    r = urllib.request.Request(url, headers={"Authorization": f"Bearer {PAT}"})
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        data = resp.read()
    return data if binary else json.loads(data)


def sql(q):
    r = urllib.request.Request(
        f"{API}/database/query",
        data=json.dumps({"query": q}).encode(),
        headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        return {"error": e.read().decode()[:300]}


print("=" * 70)
print("1. DEPLOYED EDGE FUNCTIONS")
print("=" * 70)
fns = req(f"{API}/functions")
for f in sorted(fns, key=lambda x: x.get("slug", "")):
    print(f"  {f.get('slug','?'):28s} verify_jwt={str(f.get('verify_jwt')):5s} "
          f"status={f.get('status','?'):8s} updated={f.get('updated_at','?')}  size={f.get('size')}B")

for label, q in [
    ("2. PUBLIC TABLES", "select tablename from pg_tables where schemaname='public' order by 1"),
    ("3. RLS STATUS PER TABLE",
     "select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c "
     "join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1"),
    ("4. ROW POLICIES",
     "select tablename, policyname, cmd, roles, qual from pg_policies where schemaname='public' "
     "order by tablename, policyname"),
    ("5. PG_CRON JOBS", "select jobid, schedule, command, active from cron.jobs order by jobid"),
    ("6. LLM MODELS", "select id, priority, supports_json_schema, active from llm_models order by priority"),
    ("7. HELPER RPCs", "select proname from pg_proc where proname in ('claim_job','consume_budget')"),
    ("8. GRANTS anon/authenticated",
     "select grantee, table_name, privilege_type from information_schema.role_table_grants "
     "where table_schema='public' and grantee in ('anon','authenticated') "
     "order by table_name, grantee, privilege_type"),
    ("9. TABLE SIZES",
     "select relname, n_live_tup from pg_stat_user_tables order by relname"),
]:
    print("=" * 70)
    print(label)
    print("=" * 70)
    res = sql(q)
    if isinstance(res, dict) and "error" in res:
        print("  ERROR:", res["error"][:200])
        continue
    if not res:
        print("  (no rows)")
    for row in res:
        print("  " + json.dumps(row)[:400])

print("=" * 70)
print("10. DEPLOYED FUNCTION BODY DRIFT CHECK (fresh fetch)")
print("=" * 70)
MARKERS = {
    "advance-analysis": [
        "OPENROUTER_API_KEY", "GLM_API_KEY", "GEMINI_API_KEY", "api.z.ai",
        "topUpCompetitorPicks", "blendSeoScore", "Social preview image",
        "HARD_DEADLINE_MS", "BOILERPLATE_SELECTORS",
    ],
    "polar-webhook": ["order.paid", "report_credits", "base64ToBytes", "whsec_"],
    "start-analysis": ["report_credits", "selfHealPolarSubscriptions", "corsOriginAllowed"],
    "sweeper": ["reconcilePolarSubscriptions", "claim_job"],
    "free-audit": ["free_audits", "cf-connecting-ip"],
}
for slug, markers in MARKERS.items():
    try:
        body = req(f"{API}/functions/{slug}/body", timeout=180, binary=True)
        path = os.path.join(OUT_DIR, slug + ".bin")
        with open(path, "wb") as f:
            f.write(body)
        text = body.decode("utf-8", errors="ignore")
        found = {m: text.count(m) for m in markers}
        print(f"  {slug} ({len(body)} bytes):")
        for m, n in found.items():
            print(f"    {'HIT ' if n else '----'} {m}: {n}")
    except Exception as e:
        print(f"  {slug}: FETCH FAILED — {str(e)[:150]}")

print("\nDONE")
