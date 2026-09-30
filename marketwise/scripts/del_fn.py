#!/usr/bin/env python3
import sys, urllib.request
PAT = "sbp_REDACTED_FOR_EXPORT"
REF = "ffoevhldpppyfsfgufmx"
slug = sys.argv[1]
req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{REF}/functions/{slug}",
    headers={"Authorization": f"Bearer {PAT}"}, method="DELETE")
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        print("HTTP", r.status)
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:300])
