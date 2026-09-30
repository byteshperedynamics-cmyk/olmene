#!/usr/bin/env python3
"""Direct SMTP test against Brevo relay — verifies credentials are accepted
and a message is queued (delivered to the recipient inbox)."""
import smtplib
from email.mime.text import MIMEText
import sys

SMTP_LOGIN = "bb2c7e001@smtp-brevo.com"
# key passed via env to avoid hardcoding
SMTP_KEY = __import__("os").environ["BREVO_SMTP_KEY"]

msg = MIMEText(
    "<div style='font-family:sans-serif;padding:16px;'>"
    "<b>Marketwise SMTP test</b><br>This confirms Brevo SMTP is working for Supabase Auth. "
    "If you can read this, the new email pipeline is live.</div>",
    "html",
)
msg["Subject"] = "Marketwise — SMTP pipeline test"
msg["From"] = "Marketwise <kalyntwork@gmail.com>"
msg["To"] = "kalyntwork@gmail.com"

try:
    with smtplib.SMTP("smtp-relay.brevo.com", 587, timeout=30) as s:
        s.starttls()
        s.login(SMTP_LOGIN, SMTP_KEY)
        s.send_message(msg)
        print("SMTP TEST OK — credentials accepted, message queued to kalyntwork@gmail.com")
except Exception as e:
    print("SMTP TEST FAILED:", type(e).__name__, str(e)[:300])
    sys.exit(1)
