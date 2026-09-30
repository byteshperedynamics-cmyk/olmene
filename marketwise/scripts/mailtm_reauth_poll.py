#!/usr/bin/env python3
"""Re-auth a mail.tm inbox and poll for the magic-link email."""
import json, re, sys, time, urllib.request, urllib.error

ADDR = "mw-e2e-1790364225@uberip.com"
PASSWORD = "Mw1790364225x!"
BASE = "https://api.mail.tm"

def req(method, path, data=None, token=None):
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
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

st, tok = req("POST", "/token", {"address": ADDR, "password": PASSWORD})
if st != 200:
    print(json.dumps({"error": f"token {st}"})); sys.exit(1)
token = tok["token"]

deadline = time.time() + 150
while time.time() < deadline:
    st, msgs = req("GET", "/messages?page=1", token=token)
    items = msgs.get("hydra:member", []) if isinstance(msgs, dict) else msgs
    for m in items:
        full = req("GET", f"/messages/{m['id']}", token=token)[1]
        text = full.get("text") or ""
        html_list = full.get("html") or []
        body = text + " " + ("".join(html_list) if isinstance(html_list, list) else str(html_list))
        links = re.findall(r"https://[^\s\"<>]+verify[^\s\"<>]+", body)
        print(json.dumps({
            "from": m.get("from", {}).get("address"),
            "subject": m.get("subject"),
            "link": links[0] if links else None,
            "snippet": text[:160],
        }))
        sys.exit(0)
    time.sleep(5)
print(json.dumps({"error": "timeout waiting for email"}))
sys.exit(1)
