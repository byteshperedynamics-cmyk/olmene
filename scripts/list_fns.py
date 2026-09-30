#!/usr/bin/env python3
import json, urllib.request
PAT = "sbp_REDACTED_FOR_EXPORT"
REF = "ffoevhldpppyfsfgufmx"
req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/functions", headers={"Authorization": f"Bearer {PAT}"})
with urllib.request.urlopen(req, timeout=60) as r:
    fns = json.load(r)
for f in fns:
    print(f"{f.get('slug'):30s} verify_jwt={f.get('verify_jwt')} status={f.get('status')} updated={f.get('updated_at')}")
