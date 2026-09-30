#!/usr/bin/env python3
"""Fetch edge function logs via Management API."""
import json, sys, urllib.request, urllib.parse
PAT = "sbp_REDACTED_FOR_EXPORT"
REF = "ffoevhldpppyfsfgufmx"
slug = sys.argv[1] if len(sys.argv) > 1 else "polar-webhook"
params = sys.argv[2] if len(sys.argv) > 2 else ""
url = f"https://api.supabase.com/v1/projects/{REF}/analytics/endpoints/logs?{params}"
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {PAT}"})
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:1500]); sys.exit(1)
print(json.dumps(data, indent=1, default=str)[:8000])
