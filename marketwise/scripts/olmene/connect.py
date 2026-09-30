#!/usr/bin/env python3
"""
olmene.com — Cloudflare connection automation
=============================================

Connects the olmene.com domain (Cloudflare zone) to:
  1. a NEW Worker named `olmene` (placeholder deployed from ./olmene scaffold)
  2. the GitHub repo byteshperedynamics-cmyk/olmene via Workers Builds
     (push-to-deploy CI), and
  3. custom domains olmene.com + www.olmene.com routed to that Worker.

Usage:
    export CLOUDFLARE_API_TOKEN=...        # or pass --token-file
    # Global API Key (cfk_...) instead:
    export CLOUDFLARE_API_KEY=cfk_... CLOUDFLARE_EMAIL=you@example.com
    python3 scripts/olmene/connect.py status
    python3 scripts/olmene/connect.py all
    python3 scripts/olmene/connect.py <subcommand>   # fine-grained resume

Subcommands:
    status             show token/account/zone/worker/domain/builds state
    deploy-placeholder deploy the initial Worker from the olmene/ scaffold
    connect-repo       repo connection + build config + deploy hook
    attach-domains     attach olmene.com and www.olmene.com to the Worker
    trigger-build      fire the deploy hook and poll the first build
    verify             live HTTP checks against both hostnames
    all                everything above, in order

State is persisted to scratch/olmene_state.json (gitignored).
The token is only ever read from env / token-file and sent in the
Authorization header — never logged, never written to disk.
"""

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://api.cloudflare.com/client/v4"

DOMAIN = "olmene.com"
WWW = "www.olmene.com"
REPO_OWNER = "byteshperedynamics-cmyk"
REPO_NAME = "olmene"
REPO_BRANCH = "main"
WORKER_NAME = "olmene"
SCAFFOLD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "olmene")
STATE_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "scratch", "olmene_state.json")

# Adaptive build commands: safe for every repo shape (worker project,
# framework site, plain static). Used when config_autofill is unavailable.
# NOTE: the assets directory is computed into shell var $D *outside* of any
# quotes so it actually expands; printf '%s' then injects it into the JSON.
BUILD_CMD_DEFAULT = "if test -f package.json; then npm run build --if-present; fi"
DEPLOY_CMD_DEFAULT = (
    'D=$(if test -d dist; then echo dist; elif test -d build; then echo build; '
    'elif test -d out; then echo out; elif test -d public; then echo public; '
    'else echo .; fi); '
    'test -f wrangler.toml || test -f wrangler.jsonc || '
    "printf '{\"name\":\"olmene\",\"compatibility_date\":\"2026-09-01\","
    "\"assets\":{\"directory\":\"%s\"}}' \"$D\" > wrangler.jsonc; "
    'npx wrangler deploy'
)

DASHBOARD_BASE = "https://dash.cloudflare.com"


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def die(msg, code=1):
    print(f"\n✗ ERROR: {msg}", file=sys.stderr)
    sys.exit(code)


def load_state():
    if os.path.exists(STATE_PATH):
        try:
            with open(STATE_PATH) as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_state(**kw):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    st = load_state()
    st.update(kw)
    st["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with open(STATE_PATH, "w") as f:
        json.dump(st, f, indent=2)


class CF:
    """Minimal Cloudflare API v4 client.

    Supports both auth styles:
      - API token  → Authorization: Bearer <token>
      - Global API Key (cfk_...) → X-Auth-Key + X-Auth-Email headers
    """

    def __init__(self, token, email=None):
        self.token = token
        self.email = email
        self.global_key = token.startswith("cfk_") and bool(email)

    def req(self, method, path, body=None, params=None, raw=False, timeout=60):
        url = f"{BASE}{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        data = None
        if self.global_key:
            headers = {"X-Auth-Key": self.token, "X-Auth-Email": self.email}
        else:
            headers = {"Authorization": f"Bearer {self.token}"}
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        r = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(r, timeout=timeout) as resp:
                payload = resp.read()
                if raw:
                    return resp.status, payload
                return resp.status, json.loads(payload or b"{}")
        except urllib.error.HTTPError as e:
            payload = e.read()
            try:
                j = json.loads(payload or b"{}")
            except Exception:
                j = {"errors": [{"message": payload.decode(errors="replace")[:500]}]}
            return e.code, j

    def ok(self, method, path, body=None, params=None, what=""):
        """Call API; on failure print the API's own error list and exit."""
        status, j = self.req(method, path, body=body, params=params)
        if status >= 400 or not j.get("success", False):
            errs = "; ".join(
                f"[{e.get('code')}] {e.get('message')}"
                for e in j.get("errors", [{"code": status, "message": "unknown"}])
            )
            die(f"{method} {path} failed ({status}): {errs}\n  while: {what}")
        return j.get("result")

    def try_call(self, method, path, body=None, params=None):
        status, j = self.req(method, path, body=body, params=params)
        if status >= 400 or not j.get("success", False):
            errs = "; ".join(
                f"[{e.get('code')}] {e.get('message')}" for e in j.get("errors", [])
            )
            return False, status, errs, j.get("result")
        return True, status, "", j.get("result")


def mask(s, keep=6):
    if not s:
        return "(none)"
    return s[:keep] + "…" if len(s) > keep else s


# --------------------------------------------------------------------------
# discovery
# --------------------------------------------------------------------------

def find_account_and_zone(cf):
    """Find the account holding the olmene.com zone. Handles account tokens
    (which fail /user/tokens/verify) by going straight to /accounts."""
    accounts = cf.ok("GET", "/accounts", what="listing accounts your token can see")
    if not accounts:
        die("token can see no accounts — check it has Account Settings:Read")

    hits = []
    for acct in accounts:
        ok, status, err, zones = cf.try_call(
            "GET", "/zones", params={"name": DOMAIN, "account.id": acct["id"]}
        )
        if ok and zones:
            hits.append((acct, zones[0]))
        elif ok and not zones:
            # some tokens cannot filter by account.id — retry without it
            ok2, _, _, zones2 = cf.try_call("GET", "/zones", params={"name": DOMAIN})
            if ok2 and zones2:
                za = {z["account"]["id"] for z in zones2}
                if acct["id"] in za:
                    zone = next(z for z in zones2 if z["account"]["id"] == acct["id"])
                    hits.append((acct, zone))
                break
    if not hits:
        names = ", ".join(a["name"] for a in accounts)
        die(
            f"zone {DOMAIN} not found in any account visible to this token "
            f"({names}). If the domain was just purchased, give the zone a "
            "minute to appear; also verify the token has Zone:Read."
        )
    acct, zone = hits[0]
    if len(hits) > 1:
        print(f"  ⚠ zone exists in {len(hits)} accounts; using {acct['name']}")
    return acct, zone


def get_script_tag(cf, account_id, worker_name):
    """Workers Builds APIs key off the script's system tag, not its name."""
    ok, status, err, result = cf.try_call(
        "GET", f"/accounts/{account_id}/workers/scripts-search",
        params={"name": worker_name},
    )
    if ok and result:
        for item in result:
            if item.get("environment_is_default", True) or item.get("id"):
                return item.get("id") or item.get("tag")
    # fallback: plain scripts list, match by default environment
    ok2, _, _, result2 = cf.try_call(
        "GET", f"/accounts/{account_id}/workers/scripts"
    )
    if ok2 and result2:
        for s in result2:
            if s.get("id") and not s.get("environment"):
                return s["id"]
    return None


# --------------------------------------------------------------------------
# subcommands
# --------------------------------------------------------------------------

def cmd_status(cf, args):
    print(f"== olmene.com connection status ==")
    acct, zone = find_account_and_zone(cf)
    print(f"  account : {acct['name']}  ({acct['id']})")
    print(f"  zone    : {zone['name']}  status={zone['status']}  id={zone['id']}")

    st = load_state()

    # worker
    tag = get_script_tag(cf, acct["id"], WORKER_NAME)
    if tag:
        print(f"  worker  : '{WORKER_NAME}' EXISTS  tag={tag}")
        save_state(account_id=acct["id"], zone_id=zone["id"], script_tag=tag)
    else:
        print(f"  worker  : '{WORKER_NAME}' not created yet")

    # custom domains
    domains = None
    ok, _, _, result = cf.try_call(
        "GET", f"/accounts/{acct['id']}/workers/domains", params={"per_page": 100}
    )
    if ok:
        domains = result or []
        mine = [d for d in domains if d.get("service") == WORKER_NAME]
        hostnames = [d.get("hostname") for d in mine]
        print(f"  domains : {', '.join(hostnames) if hostnames else '(none attached to olmene)'}")
        for d in domains:
            if d.get("hostname") in (DOMAIN, WWW) and d.get("service") != WORKER_NAME:
                print(f"           ⚠ {d['hostname']} is attached to a DIFFERENT worker: {d['service']}")

    # build config
    if tag:
        ok, status, err, result = cf.try_call(
            "GET", f"/accounts/{acct['id']}/builds/workers/{tag}"
        )
        if ok and result:
            repo = (result.get("git_repository") or {})
            print(f"  builds  : CONNECTED to {repo.get('provider_type')}:"
                  f"{repo.get('provider_account_name')}/{repo.get('repo_name')}"
                  f" @ {repo.get('branch')}")
            ps = result.get("production_settings") or {}
            print(f"            build : {ps.get('build_command') or '(none)'}")
            print(f"            deploy: {ps.get('deploy_command')}")
        else:
            print(f"  builds  : not connected  ({err or 'no config'})")

    # latest build
    if tag:
        ok, _, _, builds = cf.try_call(
            "GET", f"/accounts/{acct['id']}/builds/workers/{tag}/builds",
            params={"per_page": 1},
        )
        if ok and builds:
            b = builds[0] if isinstance(builds, list) else builds
            if isinstance(b, dict):
                print(f"  last bld: {b.get('status')}  {b.get('created_on','')}  "
                      f"id={b.get('id') or b.get('build_uuid')}")

    # live DNS
    import socket
    for host in (DOMAIN, WWW):
        try:
            ip = socket.gethostbyname(host)
            print(f"  dns     : {host} → {ip}")
        except Exception:
            print(f"  dns     : {host} → no resolution yet")

    print(f"  hook    : {mask(st.get('deploy_hook_url'), 40)}")


def cmd_deploy_placeholder(cf, args):
    print(f"== deploying placeholder worker '{WORKER_NAME}' ==")
    acct, zone = find_account_and_zone(cf)
    save_state(account_id=acct["id"], zone_id=zone["id"])

    env = dict(os.environ)
    if cf.global_key:
        env["CLOUDFLARE_API_KEY"] = cf.token
        env["CLOUDFLARE_EMAIL"] = cf.email
    else:
        env["CLOUDFLARE_API_TOKEN"] = cf.token
    env["CLOUDFLARE_ACCOUNT_ID"] = acct["id"]
    scaffold = os.path.abspath(SCAFFOLD_DIR)
    if not os.path.exists(os.path.join(scaffold, "wrangler.jsonc")):
        die(f"scaffold missing: {scaffold}/wrangler.jsonc")

    print(f"  wrangler deploy in {scaffold} …")
    proc = subprocess.run(
        ["npx", "wrangler", "deploy", "--name", WORKER_NAME],
        cwd=scaffold, env=env, capture_output=True, text=True, timeout=600,
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    for line in out.splitlines():
        if any(k in line for k in ("Deployed", "Uploaded", "Current Version", "wrangler", "Error", "error")):
            print(f"  | {line.strip()}")
    if proc.returncode != 0:
        die(f"wrangler deploy failed (exit {proc.returncode}).\n{out[-2000:]}")

    tag = get_script_tag(cf, acct["id"], WORKER_NAME)
    if not tag:
        die("worker deployed but could not resolve its system tag via scripts-search")
    save_state(script_tag=tag, worker_deployed=True)
    print(f"  ✓ worker '{WORKER_NAME}' live, tag={tag}")


def cmd_connect_repo(cf, args):
    print(f"== connecting github.com/{REPO_OWNER}/{REPO_NAME} (branch {args.branch}) ==")
    st = load_state()
    acct, zone = find_account_and_zone(cf)
    save_state(account_id=acct["id"], zone_id=zone["id"])

    tag = st.get("script_tag") or get_script_tag(cf, acct["id"], WORKER_NAME)
    if not tag:
        die("worker 'olmene' not found — run `deploy-placeholder` first")
    save_state(script_tag=tag)

    # 1) build token (Workers Builds deploy credential, managed by CF)
    ok, status, err, tokens = cf.try_call("GET", f"/accounts/{acct['id']}/builds/tokens")
    token_uuid = None
    if ok and tokens:
        token_uuid = tokens[0].get("build_token_uuid") or tokens[0].get("uuid")
    if not token_uuid:
        die(
            "no Workers Builds token on this account. Open "
            f"{DASHBOARD_BASE}/{acct['id']}/workers-and-pages → any Worker → "
            "Settings → Builds → Connect (once), which provisions the default "
            "build token; then re-run this command."
        )
    print(f"  build token: {mask(token_uuid, 8)}")

    # 2) repository connection (requires the Cloudflare GitHub App to be
    #    installed on the byteshperedynamics-cmyk GitHub account, with access
    #    to the `olmene` repository)
    conn_body = {
        "repo_id": REPO_NAME,
        "repo_name": REPO_NAME,
        "provider_type": "github",
        "provider_account_id": REPO_OWNER,
        "provider_account_name": REPO_OWNER,
    }
    ok, status, err, conn = cf.try_call(
        "PUT", f"/accounts/{acct['id']}/builds/repos/connections", body=conn_body
    )
    if not ok:
        if "install" in err.lower() or "app" in err.lower() or status in (400, 404, 403):
            print("\n  ✗ The Cloudflare GitHub App is not installed on the "
                  f"{REPO_OWNER} GitHub account (or has no access to `{REPO_NAME}`).\n")
            print("  ONE-TIME manual step (~30 seconds):")
            print(f"    1. Open {DASHBOARD_BASE}/{acct['id']}/workers-and-pages")
            print("    2. Create application → Import a repository → Connect to Git → GitHub")
            print("       (cancel before actually creating — the point is only to authorize the App)")
            print(f"    3. In GitHub, grant the Cloudflare app access to {REPO_OWNER}/{REPO_NAME}")
            print("    4. Re-run: python3 scripts/olmene/connect.py connect-repo\n")
            die(f"API said: {err}")
    conn_uuid = None
    if isinstance(conn, dict):
        conn_uuid = conn.get("repo_connection_uuid") or conn.get("uuid") or conn.get("id")
    print(f"  repo connection: {mask(conn_uuid, 8) or '(implicit)'}")

    # 3) build config — prefer the API's own auto-detection for this repo
    build_cmd, deploy_cmd = BUILD_CMD_DEFAULT, DEPLOY_CMD_DEFAULT
    for prov_acct in (REPO_OWNER, str(st.get("github_numeric_id") or "")):
        if not prov_acct:
            continue
        ok, _, _, auto = cf.try_call(
            "GET",
            f"/accounts/{acct['id']}/builds/repos/github/{prov_acct}/{REPO_NAME}/config_autofill",
        )
        if ok and isinstance(auto, dict):
            b = auto.get("build_command") or auto.get("build")
            d = auto.get("deploy_command") or auto.get("deploy")
            if b is not None:
                build_cmd = b
            if d:
                deploy_cmd = d
            print(f"  autofill (provider_account={prov_acct}): build={b!r} deploy={d!r}")
            break
    else:
        print("  autofill unavailable → using adaptive defaults")
    print(f"  build  command: {build_cmd}")
    print(f"  deploy command: {deploy_cmd}")

    settings = {
        "build_command": build_cmd,
        "deploy_command": deploy_cmd,
        "build_token_uuid": token_uuid,
        "root_directory": "/",
        "build_caching_enabled": True,
    }
    body = {
        "script_tag": tag,
        "git_repository": {
            "repo_id": REPO_NAME,
            "repo_name": REPO_NAME,
            "provider_type": "github",
            "provider_account_id": REPO_OWNER,
            "provider_account_name": REPO_OWNER,
            "branch": args.branch,
        },
        "production_settings": settings,
        "previews_enabled": False,
        "previews_base_config": dict(settings),
    }
    ok, status, err, result = cf.try_call(
        "POST", f"/accounts/{acct['id']}/builds/workers", body=body
    )
    if not ok:
        if "exist" in err.lower() or status == 409:
            print("  build config already exists → updating via PATCH")
            ok, status, err, result = cf.try_call(
                "PATCH", f"/accounts/{acct['id']}/builds/workers/{tag}", body=body
            )
        if not ok:
            die(f"creating build config failed: {err}")
    print(f"  ✓ repo connected for push-to-deploy on branch '{args.branch}'")

    # 4) deploy hook — lets us trigger the first build without a new push
    ok, status, err, hook = cf.try_call(
        "POST", f"/accounts/{acct['id']}/builds/workers/{WORKER_NAME}/deploy_hooks",
        body={"deploy_hook_name": "olmene-initial", "branch": args.branch},
    )
    hook_url = None
    if ok and isinstance(hook, dict):
        hook_url = hook.get("url") or hook.get("deploy_hook_url") or hook.get("hook_url")
    if hook_url:
        save_state(deploy_hook_url=hook_url, repo_connected=True, branch=args.branch)
        print(f"  ✓ deploy hook created: {mask(hook_url, 44)}")
    else:
        save_state(repo_connected=True, branch=args.branch)
        print(f"  ⚠ deploy hook not created ({err or 'no url in response'}) — "
              "first build will run on the next push instead")


def cmd_attach_domains(cf, args):
    print(f"== attaching {DOMAIN} + {WWW} to worker '{WORKER_NAME}' ==")
    st = load_state()
    acct, zone = find_account_and_zone(cf)
    save_state(account_id=acct["id"], zone_id=zone["id"])
    zone_id = zone["id"]

    # worker must exist
    if not st.get("script_tag") and not get_script_tag(cf, acct["id"], WORKER_NAME):
        die("worker 'olmene' not found — run `deploy-placeholder` first")

    # existing worker custom domains
    existing = {}
    ok, _, _, domains = cf.try_call(
        "GET", f"/accounts/{acct['id']}/workers/domains", params={"per_page": 100}
    )
    if ok and domains:
        for d in domains:
            existing[d.get("hostname")] = d

    for hostname in (DOMAIN, WWW):
        print(f"-- {hostname}")
        cur = existing.get(hostname)
        if cur and cur.get("service") == WORKER_NAME:
            print(f"   already attached to '{WORKER_NAME}' (id={cur.get('id')})")
            continue
        if cur:
            die(
                f"{hostname} is attached to worker '{cur.get('service')}'. "
                "Detach it first (Workers & Pages → that worker → Settings → "
                "Domains & Routes) or pass --force-detach."
            )

        # clear conflicting DNS records (A/AAAA/CNAME on the exact name —
        # required before a custom domain can take over the hostname).
        # MX/TXT/NS etc. are never touched.
        ok, _, _, recs = cf.try_call(
            "GET", f"/zones/{zone_id}/dns_records", params={"name": hostname, "per_page": 100}
        )
        removed = 0
        if ok and recs:
            for rec in recs:
                if rec.get("type") in ("A", "AAAA", "CNAME"):
                    okd, _, erd, _ = cf.try_call(
                        "DELETE", f"/zones/{zone_id}/dns_records/{rec['id']}"
                    )
                    if okd:
                        removed += 1
                        print(f"   removed DNS {rec['type']} {hostname} → {rec.get('content')}")
                    else:
                        print(f"   ⚠ could not remove DNS {rec['type']}: {erd}")
        if removed:
            print(f"   ({removed} conflicting record(s) cleared — the custom domain will recreate routing)")

        dom = cf.ok(
            "PUT", f"/accounts/{acct['id']}/workers/domains",
            body={"hostname": hostname, "service": WORKER_NAME, "zone_id": zone_id},
            what=f"attaching {hostname}",
        )
        print(f"   ✓ attached (domain id={dom.get('id')})")

    save_state(domains_attached=True)
    print("  note: certificate activation can take ~1–5 min for a new hostname")


def cmd_trigger_build(cf, args):
    print("== triggering first build from repository ==")
    st = load_state()
    acct, zone = find_account_and_zone(cf)

    hook = st.get("deploy_hook_url")
    if not hook:
        # try to find/create one
        ok, _, _, hooks = cf.try_call(
            "GET", f"/accounts/{acct['id']}/builds/workers/{WORKER_NAME}/deploy_hooks"
        )
        if ok and hooks:
            hook = (hooks[0] or {}).get("url")
        if not hook:
            ok, _, err, h = cf.try_call(
                "POST", f"/accounts/{acct['id']}/builds/workers/{WORKER_NAME}/deploy_hooks",
                body={"deploy_hook_name": "olmene-initial", "branch": st.get("branch", REPO_BRANCH)},
            )
            if ok and isinstance(h, dict):
                hook = h.get("url") or h.get("deploy_hook_url")
        if not hook:
            die("no deploy hook available — push a commit to the repo or run the build from the dashboard")
        save_state(deploy_hook_url=hook)

    print(f"  firing hook {mask(hook, 44)} …")
    req = urllib.request.Request(hook, method="POST", data=b"")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(f"  hook fired: HTTP {resp.status}")
    except urllib.error.HTTPError as e:
        die(f"hook returned HTTP {e.code}: {e.read()[:300]}")

    tag = st.get("script_tag") or get_script_tag(cf, acct["id"], WORKER_NAME)
    if not tag:
        return
    print("  polling build status (this can take several minutes)…")
    deadline = time.time() + args.timeout
    last = None
    while time.time() < deadline:
        ok, _, _, builds = cf.try_call(
            "GET", f"/accounts/{acct['id']}/builds/workers/{tag}/builds",
            params={"per_page": 5},
        )
        if ok and builds:
            b = builds[0] if isinstance(builds, list) else builds
            if isinstance(b, dict):
                status_now = b.get("status")
                bid = b.get("id") or b.get("build_uuid")
                if status_now != last:
                    print(f"  build {bid}: {status_now}")
                    last = status_now
                if status_now in ("success", "succeeded", "complete", "completed"):
                    print("  ✓ BUILD SUCCEEDED — repository is now live on the domain")
                    return
                if status_now in ("failure", "failed", "error", "canceled"):
                    print("  ✗ build failed — fetching tail of logs")
                    ok2, _, _, logs = cf.try_call(
                        "GET", f"/accounts/{acct['id']}/builds/builds/{bid}/logs"
                    )
                    if ok2 and logs:
                        text = logs if isinstance(logs, str) else json.dumps(logs)
                        print("  " + text[-1500:])
                    die(
                        "fix the repo/build settings, then re-run "
                        "`trigger-build` (or push a commit). Build settings can "
                        f"be tuned via PATCH /builds/workers/{tag} or the dashboard."
                    )
        time.sleep(10)
    print("  ⚠ timed out waiting for build completion — check the dashboard Builds tab")


def cmd_verify(cf, args):
    print("== live verification ==")
    import socket
    import ssl
    import urllib.request as rq

    all_ok = True
    for host in (DOMAIN, WWW):
        for path in ("/", "/healthz"):
            url = f"https://{host}{path}"
            try:
                req = rq.Request(url, headers={"User-Agent": "olmene-connect-verify/1.0"})
                with rq.urlopen(req, timeout=30) as resp:
                    body = resp.read(4096).decode(errors="replace")
                    src = (resp.headers.get("x-olmene-source")
                           or ("placeholder" if resp.headers.get("x-olmene-placeholder") else "unknown"))
                    print(f"  {url} → HTTP {resp.status} [source: {src}]")
            except urllib.error.HTTPError as e:
                print(f"  {url} → HTTP {e.code} ✗")
                all_ok = False
            except Exception as e:
                print(f"  {url} → {type(e).__name__}: {e} ✗")
                all_ok = False

    for host in (DOMAIN, WWW):
        try:
            print(f"  dns {host} → {socket.gethostbyname(host)}")
        except Exception:
            print(f"  dns {host} → no resolution ✗")
            all_ok = False

    print("\n  " + ("✓ all checks passed" if all_ok else "✗ some checks failed — see above"))
    if not all_ok:
        sys.exit(2)


def cmd_all(cf, args):
    cmd_deploy_placeholder(cf, args)
    print()
    cmd_connect_repo(cf, args)
    print()
    cmd_attach_domains(cf, args)
    print()
    if not args.no_build:
        cmd_trigger_build(cf, args)
        print()
    cmd_verify(cf, args)


# --------------------------------------------------------------------------
# entry
# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument("command", choices=[
        "status", "deploy-placeholder", "connect-repo", "attach-domains",
        "trigger-build", "verify", "all",
    ])
    ap.add_argument("--token-file", help="file containing the CF API token (default: env CLOUDFLARE_API_TOKEN)")
    ap.add_argument("--email", help="account email (required for Global API Key auth; or env CLOUDFLARE_EMAIL)")
    ap.add_argument("--branch", default=REPO_BRANCH)
    ap.add_argument("--timeout", type=int, default=900, help="build poll timeout seconds")
    ap.add_argument("--no-build", action="store_true", help="'all': skip triggering the first build")
    args = ap.parse_args()

    token = None
    if args.token_file:
        with open(os.path.expanduser(args.token_file)) as f:
            token = f.read().strip()
    token = token or os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    email = (args.email or os.environ.get("CLOUDFLARE_EMAIL", "")).strip()
    if not token:
        # Global API Key style: CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL
        token = os.environ.get("CLOUDFLARE_API_KEY", "").strip()
        if token and not email:
            die("CLOUDFLARE_API_KEY (Global Key) also needs CLOUDFLARE_EMAIL set")
    if not token:
        die("no token: set CLOUDFLARE_API_TOKEN, or CLOUDFLARE_API_KEY+CLOUDFLARE_EMAIL, or pass --token-file")
    if token.startswith("cfk_") and not email:
        die("this is a Global API Key (cfk_…) — also pass --email you@example.com or set CLOUDFLARE_EMAIL")
    if token.startswith("cfk_"):
        print("  (Global API Key auth: X-Auth-Key + X-Auth-Email)")
    elif token.startswith("cfat_"):
        print("  (account token detected — /user/tokens/verify will not work for it; using /accounts directly)")

    cf = CF(token, email=email)

    # quick auth sanity before doing anything else
    if cf.global_key:
        ok, status, err, _ = cf.try_call("GET", "/user")
        if not ok:
            die(f"Global API Key rejected: {err} — check CLOUDFLARE_API_KEY / CLOUDFLARE_EMAIL")
    else:
        ok, status, err, _ = cf.try_call("GET", "/user/tokens/verify")
        if not ok:
            ok2, status2, err2, accts = cf.try_call("GET", "/accounts")
            if not ok2:
                die(f"token rejected by Cloudflare: {err2 or err} — paste a fresh token with "
                    "Account:Read, Zone:Read, DNS:Edit, Workers Scripts:Edit, "
                    "Workers Builds:Edit, Workers Domain Settings:Edit")

    {
        "status": cmd_status,
        "deploy-placeholder": cmd_deploy_placeholder,
        "connect-repo": cmd_connect_repo,
        "attach-domains": cmd_attach_domains,
        "trigger-build": cmd_trigger_build,
        "verify": cmd_verify,
        "all": cmd_all,
    }[args.command](cf, args)


if __name__ == "__main__":
    main()
