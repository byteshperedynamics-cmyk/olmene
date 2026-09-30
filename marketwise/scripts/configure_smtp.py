#!/usr/bin/env python3
"""Connect Brevo (free, 300 emails/day) as Supabase Auth custom SMTP.

Replaces Supabase's built-in SMTP (2 emails/hour project-wide cap) with
Brevo's relay, raising the send limit to 30/hour (Brevo hard cap: 300/day).

Usage:
  BREVO_SMTP_LOGIN=<login>  BREVO_SMTP_KEY=<xkeysib-...>  SENDER_EMAIL=<from> \
  python3 scripts/configure_smtp.py

Credentials are read from env vars only — never logged, never written to disk.
"""
import json
import os
import sys
import urllib.error
import urllib.request

PAT = "sbp_REDACTED_FOR_EXPORT"
REF = "ffoevhldpppyfsfgufmx"
API = f"https://api.supabase.com/v1/projects/{REF}/config/auth"

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp-relay.brevo.com")
SMTP_PORT = os.environ.get("SMTP_PORT", "587")  # API expects a string
SMTP_USER = os.environ.get("BREVO_SMTP_LOGIN", "")
SMTP_PASS = os.environ.get("BREVO_SMTP_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "kalyntwork@gmail.com")
SENDER_NAME = os.environ.get("SENDER_NAME", "Marketwise")
RATE_LIMIT = int(os.environ.get("RATE_LIMIT_EMAIL_SENT", "30"))  # per hour

MAGIC_LINK_HTML = (
    "<div style=\"font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;"
    "max-width:560px;margin:0 auto;padding:32px 24px;color:#1f2937;\">"
    "<p style=\"font-size:15px;font-weight:600;margin:0 0 24px;\">Marketwise</p>"
    "<h2 style=\"font-size:22px;margin:0 0 12px;\">Your sign-in link</h2>"
    "<p style=\"font-size:15px;line-height:1.6;margin:0 0 24px;\">"
    "Click the button below to sign in to Marketwise. "
    "The link expires in about an hour and can only be used once.</p>"
    "<p style=\"margin:0 0 24px;\">"
    "<a href=\"{{ .ConfirmationURL }}\" style=\"display:inline-block;background:#B85C4C;"
    "color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;"
    "font-size:15px;font-weight:600;\">Sign in to Marketwise</a></p>"
    "<p style=\"font-size:13px;color:#6b7280;line-height:1.6;margin:0;\">"
    "If the button doesn't work, open this link in the same browser where you requested it:"
    "<br><a href=\"{{ .ConfirmationURL }}\" style=\"color:#B85C4C;\">{{ .ConfirmationURL }}</a>"
    "</p>"
    "<p style=\"font-size:13px;color:#6b7280;margin:24px 0 0;\">"
    "If you didn't request this, you can safely ignore this email.</p>"
    "</div>"
)

if not SMTP_USER or not SMTP_PASS:
    print("ERROR: BREVO_SMTP_LOGIN and BREVO_SMTP_KEY env vars are required.")
    sys.exit(1)

patch = {
    "smtp_host": SMTP_HOST,
    "smtp_port": SMTP_PORT,
    "smtp_user": SMTP_USER,
    "smtp_pass": SMTP_PASS,
    "smtp_admin_email": SENDER_EMAIL,
    "smtp_sender_name": SENDER_NAME,
    "rate_limit_email_sent": RATE_LIMIT,
    "smtp_max_frequency": 60,
    # Branded template (unlocked now that custom SMTP replaces the built-in provider)
    "mailer_subjects_magic_link": "Your Marketwise sign-in link",
    "mailer_templates_magic_link_content": MAGIC_LINK_HTML,
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
    sys.exit(1)

# Verify (smtp_pass is write-only; everything else should read back)
req = urllib.request.Request(API, headers={"Authorization": f"Bearer {PAT}"})
with urllib.request.urlopen(req, timeout=60) as r:
    cfg = json.load(r)

checks = {
    "smtp_host": cfg.get("smtp_host"),
    "smtp_port": cfg.get("smtp_port"),
    "smtp_user": cfg.get("smtp_user"),
    "smtp_admin_email": cfg.get("smtp_admin_email"),
    "smtp_sender_name": cfg.get("smtp_sender_name"),
    "rate_limit_email_sent": cfg.get("rate_limit_email_sent"),
    "smtp_max_frequency": cfg.get("smtp_max_frequency"),
    "mailer_subjects_magic_link": cfg.get("mailer_subjects_magic_link"),
}
ok = True
for k, v in checks.items():
    print(f"{k} = {json.dumps(v)}")
    if v in (None, ""):
        ok = False
tpl = cfg.get("mailer_templates_magic_link_content", "")
print("magic-link template has ConfirmationURL:", "{{ .ConfirmationURL }}" in tpl)
print("magic-link template branded (Marketwise):", "Marketwise" in tpl)
print("RESULT:", "OK" if ok else "INCOMPLETE — inspect fields above")
