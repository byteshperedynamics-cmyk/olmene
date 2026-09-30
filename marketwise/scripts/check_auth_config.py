#!/usr/bin/env python3
"""Inspect Supabase auth config: Site URL + Redirect URLs allowlist."""
import json, urllib.request, urllib.error

PAT = "sbp_REDACTED_FOR_EXPORT"
REF = "ffoevhldpppyfsfgufmx"

req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{REF}/config/auth",
    headers={"Authorization": f"Bearer {PAT}"},
)
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        cfg = json.load(r)
except urllib.error.HTTPError as e:
    print("HTTP", e.code)
    print(e.read().decode()[:2000])
    raise SystemExit(1)

keys_of_interest = [
    "SITE_URL", "URI_ALLOW_LIST", "DISABLE_SIGNUP", "ENABLE_ANON_SIGNINS",
    "MAILER_AUTOCONFIRM", "MAILER_URLPATHS_INVITE", "MAILER_URLPATHS_CONFIRMATION",
    "MAILER_URLPATHS_RECOVERY", "MAILER_URLPATHS_EMAIL_CHANGE", "MAILER_URLPATHS_MAGIC_LINK",
    "EXTERNAL_EMAIL_ENABLED", "RATE_LIMIT_EMAIL_SENT", "RATE_LIMIT_OTP",
    "SMTP_ADMIN_EMAILS", "SMTP_HOST", "SMTP_USER", "SMTP_MAX_FREQUENCY",
]
for k in keys_of_interest:
    if k in cfg:
        print(f"{k} = {json.dumps(cfg[k])}")
print("\n--- all keys containing URL/REDIRECT/MAILER/RATE/SMTP ---")
for k, v in sorted(cfg.items()):
    ku = k.upper()
    if any(t in ku for t in ("URL", "REDIRECT", "MAILER", "RATE", "SMTP", "ALLOW")):
        print(f"{k} = {json.dumps(v)[:300]}")
