#!/usr/bin/env python3
"""Full Supabase auth config dump (non-secret keys only) + live OTP probe."""
import json, urllib.request, urllib.error

PAT = "sbp_REDACTED_FOR_EXPORT"
REF = "ffoevhldpppyfsfgufmx"
SUPA = "https://ffoevhldpppyfsfgufmx.supabase.co"
ANON = "sb_publishable_CQJaLHGkc60GML5ccdWfdQ_8wO6PdTq"

# --- 1. full config ---
req = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{REF}/config/auth",
    headers={"Authorization": f"Bearer {PAT}"},
)
with urllib.request.urlopen(req, timeout=60) as r:
    cfg = json.load(r)
skip_secretish = ("smtp_pass", "secret", "client_secret", "hmac_secret", "encryption")
print("=== auth config (filtered) ===")
for k in sorted(cfg):
    if any(s in k.lower() for s in skip_secretish):
        continue
    v = cfg[k]
    if k in ("site_url", "uri_allow_list", "disable_signup", "external_email_enabled",
             "rate_limit_email_sent", "rate_limit_otp", "smtp_max_frequency",
             "mailer_otp_exp", "mailer_autoconfirm", "external_anonymous_users_enabled"):
        print(f"* {k} = {json.dumps(v)}")

# --- 2. does the stale 'get.' host even exist? ---
print("\n=== get.marketwiselabs.workers.dev reachability ===")
try:
    req = urllib.request.Request("https://get.marketwiselabs.workers.dev/", method="GET")
    with urllib.request.urlopen(req, timeout=15) as r:
        print("HTTP", r.status, r.geturl())
except Exception as e:
    print("FAILED:", type(e).__name__, str(e)[:200])

# --- 3. live OTP probe, exactly what the login page sends ---
print("\n=== /auth/v1/otp probe (app redirect_to) ===")
body = json.dumps({
    "email": "signin-diagnostic@invalid.example",
    "create_user": True,
    "data": {},
    "code_challenge": "A" * 43,
    "code_challenge_method": "s256",
    "redirect_to": "https://get.marketwiselabs.workers.dev/app/",
    "gotrue_meta_security": {"captcha_token": ""},
}).encode()
req = urllib.request.Request(
    f"{SUPA}/auth/v1/otp",
    data=body,
    headers={
        "apikey": ANON,
        "Authorization": f"Bearer {ANON}",
        "Content-Type": "application/json",
        "X-Client-Info": "supabase-js/2.x",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print("HTTP", r.status, r.read().decode()[:400])
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read().decode()[:400])
except Exception as e:
    print("FAILED:", type(e).__name__, str(e)[:200])
