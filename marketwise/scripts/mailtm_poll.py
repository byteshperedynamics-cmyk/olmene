#!/usr/bin/env python3
"""Poll a mail.tm inbox for the Supabase magic-link email; extract the link."""
import json, re, sys, time, urllib.request

TOKEN = sys.argv[1]
BASE = "https://api.mail.tm"

def req(method, path, token=None):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(BASE + path, headers=headers, method=method)
    with urllib.request.urlopen(r, timeout=30) as resp:
        return json.load(resp)

deadline = time.time() + 150
while time.time() < deadline:
    msgs = req("GET", "/messages?page=1", TOKEN)
    items = msgs.get("hydra:member", msgs) if isinstance(msgs, dict) else msgs
    for m in items:
        if "supabase" in m.get("from", {}).get("address", "").lower() or "sign" in m.get("subject", "").lower():
            full = req("GET", f"/messages/{m['id']}", TOKEN)
            body = (full.get("text") or "") + " " + (full.get("html") and "".join(full["html"]) or "")
            links = re.findall(r"https://[^\s\"<>]+verify[^\s\"<>]+", body)
            print(json.dumps({
                "from": m.get("from", {}).get("address"),
                "subject": m.get("subject"),
                "link": links[0] if links else None,
                "snippet": (full.get("text") or "")[:150],
            }))
            sys.exit(0)
    time.sleep(5)
print(json.dumps({"error": "timeout waiting for email"}))
sys.exit(1)
