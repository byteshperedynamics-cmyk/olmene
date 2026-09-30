#!/usr/bin/env python3
import json, urllib.request
PAT = "sbp_REDACTED_FOR_EXPORT"
REF = "ffoevhldpppyfsfgufmx"
req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/secrets", headers={"Authorization": f"Bearer {PAT}"})
with urllib.request.urlopen(req, timeout=60) as r:
    data = json.load(r)
for s in data:
    print(s.get("name"))
