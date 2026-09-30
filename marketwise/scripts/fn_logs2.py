#!/usr/bin/env python3
import json, sys, urllib.request, urllib.parse
PAT = "sbp_REDACTED_FOR_EXPORT"
REF = "ffoevhldpppyfsfgufmx"
sql = sys.argv[1]
params = urllib.parse.urlencode({
    "sql": sql,
    "iso_timestamp_start": "2026-09-23T00:00:00Z",
    "iso_timestamp_end": "2026-09-25T23:59:59Z",
})
url = f"https://api.supabase.com/v1/projects/{REF}/analytics/endpoints/logs?{params}"
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {PAT}"})
try:
    with urllib.request.urlopen(req, timeout=90) as r:
        data = json.load(r)
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:800]); sys.exit(1)
print(json.dumps(data, indent=1, default=str)[:9000])
