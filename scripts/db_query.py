#!/usr/bin/env python3
"""Query Supabase DB via Management API."""
import json, sys, urllib.request
PAT = "sbp_REDACTED_FOR_EXPORT"
REF = "ffoevhldpppyfsfgufmx"

def q(sql):
    body = json.dumps({"query": sql}).encode()
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/database/query",
        data=body, headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"error": e.code, "body": e.read().decode()[:2000]}

if __name__ == "__main__":
    res = q(sys.argv[1])
    print(json.dumps(res, indent=2, default=str)[:6000])
