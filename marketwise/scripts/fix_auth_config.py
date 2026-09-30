#!/usr/bin/env python3
"""Fix Supabase Auth config so sign-in/sign-up works:
1. Redirect allowlist: point at the canonical app domain
   https://get.marketwiselabs.workers.dev (+ localhost for local dev/preview).
2. Raise email send rate limit 2 -> 30/hour (built-in SMTP max) so legitimate
   attempts aren't 429-blocked.
3. Branded magic-link email template that carries BOTH the one-click link and
   the {{ .Token }} OTP code (powers the login page code fallback + works
   cross-device).
"""
import json, urllib.request, urllib.error

PAT = "sbp_REDACTED_FOR_EXPORT"
REF = "ffoevhldpppyfsfgufmx"
API = f"https://api.supabase.com/v1/projects/{REF}/config/auth"

MAGIC_LINK_HTML = (
    "<h2>Sign in to Marketwise</h2>\n"
    "<p>Click the link below to sign in. It expires in about an hour and can only be used once.</p>\n"
    "<p><a href=\"{{ .ConfirmationURL }}\">Sign in to Marketwise</a></p>\n"
    "<p>Opening this email on another device? Enter this code on the sign-in page instead:</p>\n"
    "<p style=\"font-size:24px; letter-spacing:6px; font-weight:bold;\">{{ .Token }}</p>\n"
    "<p style=\"color:#666;\">If you didn't request this, you can safely ignore this email.</p>"
)

patch = {
    "site_url": "https://get.marketwiselabs.workers.dev",
    "uri_allow_list": ",".join([
        "https://get.marketwiselabs.workers.dev/**",
        "http://localhost:3000/**",
        "http://127.0.0.1:3000/**",
        "http://localhost:8787/**",
    ]),
    # BLOCKED on free tier + built-in SMTP (both verified via API errors):
    # - rate_limit_email_sent: "Custom SMTP required to configure ... RATE_LIMIT_EMAIL_SENT"
    # - mailer templates/subjects: "Email template modification is not available for
    #   free tier projects using the default email provider"
}

req = urllib.request.Request(
    API,
    data=json.dumps(patch).encode(),
    headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"},
    method="PATCH",
)
try:
    with urllib.request.urlopen(req, timeout=60) as r:
        print("PATCH HTTP", r.status)
except urllib.error.HTTPError as e:
    print("PATCH HTTP", e.code)
    print(e.read().decode()[:2000])
    raise SystemExit(1)

# Verify
req = urllib.request.Request(API, headers={"Authorization": f"Bearer {PAT}"})
with urllib.request.urlopen(req, timeout=60) as r:
    cfg = json.load(r)
for k in ("uri_allow_list", "rate_limit_email_sent", "mailer_subjects_magic_link"):
    print(f"{k} = {json.dumps(cfg.get(k))}")
tpl = cfg.get("mailer_templates_magic_link_content", "")
print("template has ConfirmationURL:", "{{ .ConfirmationURL }}" in tpl)
print("template has Token:", "{{ .Token }}" in tpl)
