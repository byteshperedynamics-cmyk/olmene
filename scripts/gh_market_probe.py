#!/usr/bin/env python3
"""Probe the GitHub repo kalyntwork-max/market with a PAT (env: GH_PAT).
Never prints the token. Subcommand: refs | events | repos | tree"""
import json, os, sys, urllib.request

PAT = os.environ["GH_PAT"]
REPO = "kalyntwork-max/market"

def get(url):
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {PAT}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "marketwise-import",
    })
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try: body = json.load(e)
        except Exception: body = {}
        return e.code, body

cmd = sys.argv[1] if len(sys.argv) > 1 else "refs"

if cmd == "refs":
    code, d = get(f"https://api.github.com/repos/{REPO}/git/refs")
    print("HTTP", code)
    if isinstance(d, list):
        for r in d: print(r.get("ref"), "->", (r.get("object") or {}).get("sha", "")[:10])
        print(f"({len(d)} refs)")
    else: print(json.dumps(d)[:400])
elif cmd == "events":
    code, d = get(f"https://api.github.com/repos/{REPO}/events?per_page=10")
    print("HTTP", code)
    if isinstance(d, list):
        for e in d:
            pl = e.get("payload") or {}
            print(e.get("type"), e.get("created_at"), "ref=", pl.get("ref"), "size=", pl.get("size"), "commits=", len(pl.get("commits") or []))
        print(f"({len(d)} events)")
    else: print(json.dumps(d)[:400])
elif cmd == "repos":
    code, d = get("https://api.github.com/user/repos?per_page=50&sort=pushed")
    print("HTTP", code)
    for r in d:
        print(f'{r["full_name"]}  size={r["size"]}KB  pushed={r["pushed_at"]}  default={r["default_branch"]}  private={r["private"]}')
elif cmd == "pushprobe":
    # Verify contents:write by creating + deleting a probe file (net zero).
    import base64
    api = f"https://api.github.com/repos/{REPO}/contents/.push-probe"
    body = json.dumps({
        "message": "push permission probe (auto-removed)",
        "content": base64.b64encode(b"probe").decode(),
    }).encode()
    req = urllib.request.Request(api, data=body, method="PUT", headers={
        "Authorization": f"Bearer {PAT}", "Accept": "application/vnd.github+json",
        "User-Agent": "marketwise-import"})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            j = json.load(r)
            print("PUT OK — token can push. sha:", j["content"]["sha"])
            sha = j["content"]["sha"]
    except urllib.error.HTTPError as e:
        print("PUT FAILED", e.code, json.load(e).get("message", "")); raise SystemExit(1)
    dbody = json.dumps({"message": "remove probe", "sha": sha}).encode()
    dreq = urllib.request.Request(api, data=dbody, method="DELETE", headers={
        "Authorization": f"Bearer {PAT}", "Accept": "application/vnd.github+json",
        "User-Agent": "marketwise-import"})
    try:
        with urllib.request.urlopen(dreq, timeout=25) as r:
            print("DELETE OK — probe removed, repo clean")
    except urllib.error.HTTPError as e:
        print("DELETE FAILED", e.code, json.load(e).get("message", ""), "— remove .push-probe manually")
        raise SystemExit(1)
elif cmd == "tree":
    # try common branch names, print full recursive tree of the first that works
    for br in ("main", "master"):
        code, d = get(f"https://api.github.com/repos/{REPO}/git/trees/{br}?recursive=1")
        if code == 200:
            tree = d.get("tree") or []
            print(f"branch={br} HTTP {code} truncated={d.get('truncated')} entries={len(tree)}")
            for t in tree:
                print(f'{t["type"]:5} {t.get("size",""):>9} {t["path"]}')
            break
        else:
            print(f"branch={br} HTTP {code} {json.dumps(d)[:200]}")
