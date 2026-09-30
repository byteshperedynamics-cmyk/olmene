#!/usr/bin/env python3
"""Snapshot the live Cloudflare Worker state for external product examination.
Token ONLY from env (CLOUDFLARE_API_TOKEN). Secret VALUES are never fetched —
only names. Usage:
CLOUDFLARE_API_TOKEN=<t> python3 scripts/infra_snapshot_cloudflare.py <out-dir>"""
import datetime, json, os, sys, urllib.request

TOKEN = os.environ["CLOUDFLARE_API_TOKEN"]
ACCOUNT = "7948c058a723edf20967b364676c9fdc"  # MarketWise account (public in deploy script)
WORKER = "get"
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "infra/cloudflare")
STAMP = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")

def call(path):
    req = urllib.request.Request(f"https://api.cloudflare.com/client/v4{path}", headers={
        "Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

def write(relpath, data):
    full = os.path.join(OUT, relpath)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as f:
        json.dump(data, f, indent=2, default=str)
    print(f"  wrote {relpath}")

meta = {"captured_at": STAMP, "account_id": ACCOUNT, "source": "Cloudflare API (live)"}
print(f"== Cloudflare snapshot -> {OUT}")

def safe(path, relpath, note=None):
    try:
        res = call(path)
        write(relpath, {**meta, "result": res.get("result"), "errors": res.get("errors"),
                        **({"note": note} if note else {})})
    except Exception as e:
        write(relpath, {**meta, "error": str(e)[:200]})

safe(f"/accounts/{ACCOUNT}", "account.json", "account name/id only")
safe(f"/accounts/{ACCOUNT}/workers/scripts", "workers-list.json", "script names across the account")
safe(f"/accounts/{ACCOUNT}/workers/subdomain", "workers-subdomain.json")
safe(f"/accounts/{ACCOUNT}/workers/domains", "workers-domains.json")
safe(f"/accounts/{ACCOUNT}/workers/scripts/{WORKER}/settings", f"worker-{WORKER}-settings.json",
     "bindings shown with names+types; secret bindings show NAME only, never values")
safe(f"/accounts/{ACCOUNT}/workers/scripts/{WORKER}/secrets", f"worker-{WORKER}-secrets-names.json",
     "names only — never values")
safe(f"/accounts/{ACCOUNT}/workers/scripts/{WORKER}/deployments", f"worker-{WORKER}-deployments.json")
safe(f"/accounts/{ACCOUNT}/workers/scripts/{WORKER}/schedules", f"worker-{WORKER}-schedules.json",
     "cron triggers (expected: none)")
print("== Cloudflare snapshot done")
