#!/usr/bin/env python3
"""Create a mail.tm disposable inbox; print address + password + token."""
import json, sys, time, urllib.request, urllib.error

BASE = "https://api.mail.tm"

def req(method, path, data=None, token=None):
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(
        BASE + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.load(resp)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.load(e)
        except Exception:
            return e.code, {}

# 1. pick a domain
st, domains = req("GET", "/domains?page=1")
if isinstance(domains, dict):
    domain_list = domains.get("hydra:member", [])
else:
    domain_list = domains  # newer API returns a plain list
domain = next(d["domain"] for d in domain_list if d.get("isActive"))
addr = f"mw-e2e-{int(time.time())}@{domain}"
password = f"Mw{int(time.time())}x!"

st, acc = req("POST", "/accounts", {"address": addr, "password": password})
if st not in (200, 201):
    print("ACCOUNT_FAIL", st, acc); sys.exit(1)

st, tok = req("POST", "/token", {"address": addr, "password": password})
if st != 200:
    print("TOKEN_FAIL", st, tok); sys.exit(1)

print(json.dumps({"address": addr, "password": password, "token": tok["token"]}))
