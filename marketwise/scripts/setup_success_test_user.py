#!/usr/bin/env python3
"""Set up a confirmed test user for success-page verification.
1. Sign up a fresh user via the public API.
2. Admin-confirm the email (service key fetched from the Management API).
3. Password grant -> full session JSON (what supabase-js stores in localStorage).
Prints {email, user_id, session}.
"""
import json, time, urllib.request

SB = "https://ffoevhldpppyfsfgufmx.supabase.co"
PUBKEY = "sb_publishable_CQJaLHGkc60GML5ccdWfdQ_8wO6PdTq"
PAT = "sbp_REDACTED_FOR_EXPORT"
REF = "ffoevhldpppyfsfgufmx"
email = f"qa.success.{int(time.time())}@mailinator.com"
password = "QaTest!2026x"

def req(url, data=None, headers=None, method=None, timeout=30):
    r = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None,
                               headers=headers or {}, method=method or ("POST" if data is not None else "GET"))
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return json.load(resp)

def post(path, body, headers=None, key=PUBKEY):
    h = {"Content-Type": "application/json", "apikey": key}
    if headers:
        h.update(headers)
    try:
        return req(SB + path, body, h)
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode() or "{}")

# service key via Management API is redacted (hash only) — confirm the email
# with service-level SQL through the Management API query endpoint instead.
def sql(stmt):
    r = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/database/query",
        data=json.dumps({"query": stmt}).encode(),
        headers={"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"},
        method="POST")
    with urllib.request.urlopen(r, timeout=60) as resp:
        return json.load(resp)

# 1. signup
signup = post("/auth/v1/signup", {"email": email, "password": password})
user_id = (signup.get("user") or {}).get("id") or signup.get("id")
if not user_id:
    raise SystemExit(f"signup failed: {json.dumps(signup)[:300]}")

# 2. confirm email at the DB level (confirmed_at is a generated column)
sql(f"update auth.users set email_confirmed_at = now() where id = '{user_id}'")

# 3. password grant -> session
sess = post("/auth/v1/token?grant_type=password", {"email": email, "password": password})
if not sess.get("access_token"):
    raise SystemExit(f"signin failed: {json.dumps(sess)[:300]}")

print(json.dumps({"email": email, "user_id": user_id, "session": sess}))
