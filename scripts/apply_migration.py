#!/usr/bin/env python3
"""Apply a SQL migration file to the live Supabase project via the Management API.
Usage: python3 scripts/apply_migration.py <file.sql>
Reads the PAT from the SUPABASE_PAT env var, falling back to the repo copy
(see audit §4.2 — rotation pending, user accepted the risk 2026-09-29).
"""
import json, os, sys, urllib.request, urllib.error

sql_path = sys.argv[1]
PAT = os.environ.get("SUPABASE_PAT", "sbp_REDACTED_FOR_EXPORT")
REF = "ffoevhldpppyfsfgufmx"

sql = open(sql_path).read()
# The Management API driver runs in implicit-transaction mode per batch and
# rejects explicit begin/commit blocks — strip them (the whole batch is atomic).
lines = [l for l in sql.splitlines() if not l.strip().lower() in ("begin;", "commit;")]
body = "\n".join(lines)

req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{REF}/database/query",
    data=json.dumps({"query": body}).encode(),
    headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=120) as r:
        out = json.load(r)
    print("OK —", sql_path)
    if out:
        print(json.dumps(out)[:600])
except urllib.error.HTTPError as e:
    print("FAILED:", e.read().decode()[:800])
    sys.exit(1)
