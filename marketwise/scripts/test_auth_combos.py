#!/usr/bin/env python3
"""Test combination auth schemes with token + secret access key."""
import json
import subprocess

ACC = "7948c058a723edf20967b364676c9fdc"
TOKEN = "cfat_REDACTED_FOR_EXPORT"
SECRET = "f4285017eb6fb612821be3b16dc78cc836d6b45224b1150c64b734b28220beda"
API = f"https://api.cloudflare.com/client/v4/accounts/{ACC}"

def call(label, extra_headers=None, auth=None, url=API):
    cmd = ["curl", "-s", "-m", "20"]
    for h in (extra_headers or []):
        cmd += ["-H", h]
    if auth:
        cmd += ["-u", auth]
    cmd.append(url)
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    try:
        d = json.loads(out)
        errs = d.get("errors", [])
        code = errs[0].get("code") if errs else None
        msg = errs[0].get("message", "") if errs else ""
        print(f"{label:55s} -> success={d.get('success')} code={code} {msg[:40]}")
        if d.get("success"):
            print("   RESULT:", json.dumps(d.get("result"))[:300])
    except Exception:
        print(f"{label:55s} -> non-JSON: {out[:120]}")

call("Bearer token:secret", [f"Authorization: Bearer {TOKEN}:{SECRET}"])
call("Bearer secret:token", [f"Authorization: Bearer {SECRET}:{TOKEN}"])
call("Bearer secret alone", [f"Authorization: Bearer {SECRET}"])
call("Bearer token+secret concat", [f"Authorization: Bearer {TOKEN}{SECRET}"])
call("Basic token:secret", None, auth=f"{TOKEN}:{SECRET}")
call("Basic secret:token", None, auth=f"{SECRET}:{TOKEN}")
call("X-Auth-Key=token + X-Auth-Email guess", [
    "X-Auth-Key: " + TOKEN,
    "X-Auth-Email: kalyntwork@gmail.com",
])
call("Bearer token + CF-Access secret hdr", [
    f"Authorization: Bearer {TOKEN}",
    f"CF-Access-Client-Secret: {SECRET}",
])
call("Bearer secret + client id hdr", [
    f"Authorization: Bearer {SECRET}",
    f"CF-Access-Client-Id: {TOKEN}",
])
# also try verify endpoint variants
call("user/tokens/verify Bearer token", [f"Authorization: Bearer {TOKEN}"],
     url="https://api.cloudflare.com/client/v4/user/tokens/verify")
call("accounts/tokens/verify w/ account in path", [f"Authorization: Bearer {TOKEN}"],
     url=f"https://api.cloudflare.com/client/v4/accounts/{ACC}/tokens/verify")
