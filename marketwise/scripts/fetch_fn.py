#!/usr/bin/env python3
import json, sys, urllib.request
PAT = "sbp_REDACTED_FOR_EXPORT"
REF = "ffoevhldpppyfsfgufmx"
slug = sys.argv[1]
req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{REF}/functions/{slug}/body", headers={"Authorization": f"Bearer {PAT}"})
with urllib.request.urlopen(req, timeout=120) as r:
    data = r.read()
out = f"fnsrc/{slug}"
with open(out, "wb") as f:
    f.write(data)
print(f"saved {len(data)} bytes to {out}")
