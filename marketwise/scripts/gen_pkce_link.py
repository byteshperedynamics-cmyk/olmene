#!/usr/bin/env python3
"""Simulate the FULL PKCE magic-link flow without email:
1. Generate a PKCE verifier + S256 challenge.
2. Admin-generate a magiclink carrying the challenge (no email needed).
3. Print the action_link + verifier so the browser test can use both.
"""
import base64, hashlib, json, os, secrets, urllib.request

SUPA = "https://ffoevhldpppyfsfgufmx.supabase.co"
SVC = open("/tmp/svc_key").read().strip()
EMAIL = "mw-e2e-1790364225@uberip.com"

# 1. PKCE pair (same algorithm as supabase-js)
verifier = secrets.token_urlsafe(64)[:64]  # ~64 chars urlsafe
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()

body = json.dumps({
    "type": "magiclink",
    "email": EMAIL,
    "code_challenge": challenge,
    "code_challenge_method": "s256",
}).encode()
req = urllib.request.Request(
    f"{SUPA}/auth/v1/admin/generate_link",
    data=body,
    headers={
        "apikey": SVC,
        "Authorization": f"Bearer {SVC}",
        "Content-Type": "application/json",
    },
    method="POST",
)
with urllib.request.urlopen(req, timeout=60) as r:
    d = json.load(r)

link = d.get("action_link") or (d.get("properties") or {}).get("action_link")
print(json.dumps({
    "ok": bool(link),
    "link": link,
    "verifier": verifier,
    "email_otp": d.get("email_otp") or (d.get("properties") or {}).get("email_otp"),
    "keys": list(d.keys())[:6],
}, indent=1))
open("/tmp/pkce_link.json", "w").write(json.dumps({"link": link, "verifier": verifier}))
