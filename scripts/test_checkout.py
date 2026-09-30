#!/usr/bin/env python3
"""End-to-end test of create-checkout with a fresh test user."""
import json
import time
import urllib.request

SB = "https://ffoevhldpppyfsfgufmx.supabase.co"
PUBKEY = "sb_publishable_CQJaLHGkc60GML5ccdWfdQ_8wO6PdTq"
email = f"qa.checkout.{int(time.time())}@mailinator.com"
password = "QaTest!2026x"

def post(path, body, headers=None, key=PUBKEY):
    h = {"Content-Type": "application/json", "apikey": key}
    if headers:
        h.update(headers)
    req = urllib.request.Request(SB + path, data=json.dumps(body).encode(),
                                 headers=h, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")

# 1. Sign up
st, signup = post("/auth/v1/signup", {"email": email, "password": password})
print("signup:", st, str(signup)[:150])
token = (signup.get("access_token")
         or (signup.get("session") or {}).get("access_token"))
if not token:
    # email confirmation required → sign in
    st, signin = post("/auth/v1/token?grant_type=password",
                      {"email": email, "password": password})
    print("signin:", st, str(signin)[:100])
    token = signin.get("access_token")
print("token:", (token or "NONE")[:25], "...")

# 2. create-checkout for the Pro plan
st, res = post("/functions/v1/create-checkout", {"productId": "9f1761be-8e0c-4eb0-8992-45aad45d9758"},
               headers={"Authorization": f"Bearer {token}"})
print("create-checkout:", st, json.dumps(res)[:300])
print("EMAIL:", email)
