#!/usr/bin/env python3
"""Snapshot the live Supabase project (schema, RLS, functions, config, sample data)
into an infra/ folder for external product examination.

Security rules baked in:
- Token ONLY from env (SBP_PAT). Never written anywhere.
- JSON scrubber: any key matching secret-ish regex -> "[REDACTED]".
- Vault: names only. auth.users: row count only. IPs: hashed. api-keys: NOT exported.
Usage: SBP_PAT=<pat> python3 scripts/infra_snapshot_supabase.py <out-dir>"""
import datetime, hashlib, json, os, re, sys, urllib.request

PAT = os.environ["SBP_PAT"]
REF = "ffoevhldpppyfsfgufmx"
API = f"https://api.supabase.com/v1/projects/{REF}"
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "infra/supabase")
STAMP = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")

SECRET_KEY = re.compile(r"(?i)(pass(word)?|secret|token|api_?key|private_?key|credential|db_pass|jwt_secret)")
IP_KEY = re.compile(r"(?i)^(ip|ip_address|client_ip|last_ip)$")

def scrub(obj):
    if isinstance(obj, dict):
        return {k: ("[REDACTED]" if SECRET_KEY.search(k) else
                    hashlib.sha256(str(v).encode()).hexdigest()[:12] if (IP_KEY.match(k) and v) else scrub(v))
                for k, v in obj.items()}
    if isinstance(obj, list):
        return [scrub(x) for x in obj]
    return obj

def call(path, method="GET", payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, method=method, headers={
        "Authorization": f"Bearer {PAT}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        ct = r.headers.get("content-type", "")
        body = r.read().decode()
        return json.loads(body) if "json" in ct else body

def call_raw(path):
    req = urllib.request.Request(f"{API}{path}", headers={"Authorization": f"Bearer {PAT}"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()

def eszip_main_source(blob):
    """Extract the user-code bundle from an ESZIP body. Two proven heuristics:
    1) MarketWise fns with `inlined: _shared/cors` comments (see extract_entry.py)
    2) Otherwise: user bundle spans [first `import` .. first npm package-json],
       and must contain Deno.serve (sanity check)."""
    import re
    m = re.search(rb"inlined: _shared/cors", blob)
    if m:
        start = max(0, m.start() - 120)
        em = re.search(rb"\}\);\n2\.0\{\n\s+\"name\":", blob[start:])
        if em:
            end = start + em.start() + 3
        else:
            end = start
            while end < start + 2_000_000 and end < len(blob):
                try:
                    blob[start:end + 1000].decode("utf-8")
                    end += 1000
                except UnicodeDecodeError:
                    break
        src = blob[start:min(end, start + 2_000_000)].decode("utf-8", errors="replace")
        return (src.encode(), len(src)) if len(src) > 500 else None
    # heuristic 2: first import .. first npm json, must contain Deno.serve
    imp = re.search(rb"import[ *{]", blob[:200_000])
    npm = re.search(rb"2\.0\{\n\s+\"name\":", blob)
    if imp and npm and imp.start() < npm.start():
        seg = blob[imp.start():npm.start()]
        if b"Deno.serve" in seg:
            src = seg.decode("utf-8", errors="replace")
            return (src.encode(), len(src)) if len(src) > 500 else None
    return None

def sql(q):
    return call("/database/query", "POST", {"query": q})

def write(relpath, data):
    full = os.path.join(OUT, relpath)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    if isinstance(data, (dict, list)):
        data = json.dumps(scrub(data), indent=2, default=str)
        if not relpath.endswith(".json"):
            full += ".json"
    with open(full, "w") as f:
        f.write(data if isinstance(data, str) else str(data))
    print(f"  wrote {relpath}")

meta = {"captured_at": STAMP, "project_ref": REF, "source": "Supabase Management API (live)"}
print(f"== Supabase snapshot -> {OUT}")

def safe_write(relpath, fetch, note=None):
    """Fault-tolerant write: a dead endpoint must not kill the snapshot."""
    try:
        write(relpath, {**meta, **({"note": note} if note else {}), "result": fetch()})
    except Exception as e:
        print(f"  SKIP {relpath}: {e}")
        write(relpath, {**meta, "error": str(e)[:200]})

safe_write("project.json", lambda: call(""), "project metadata")
safe_write("config/database.json", lambda: call("/database/settings"), "db settings via /database/settings")
safe_write("config/auth.json", lambda: call("/config/auth"), "auth config (secret fields scrubbed)")

fns = call("/functions")
write("functions/list.json", {**meta, "functions": fns})
sec_names = {}
for fn in fns:
    slug = fn.get("slug")
    try:
        blob = call_raw(f"/functions/{slug}/body")
        src = eszip_main_source(blob)
        os.makedirs(os.path.join(OUT, "functions/sources"), exist_ok=True)
        if src:
            chunk, ln = src
            with open(os.path.join(OUT, f"functions/sources/{slug}.ts"), "w") as f:
                f.write(chunk.decode("utf-8"))
            print(f"  wrote functions/sources/{slug}.ts ({ln} bytes, extracted from eszip)")
        else:
            print(f"  {slug}: no user-bundle marker found ({len(blob)} bytes) — skipped")
    except Exception as e:
        print(f"  (no body for {slug}: {e})")
    try:
        sec_names[slug] = [s.get("name") for s in call(f"/functions/{slug}/secrets")]
    except Exception as e:
        sec_names[slug] = f"unavailable: {e}"
write("functions/secrets-names.json", {**meta, "secret_names_per_function": sec_names})

DB = "database"
write(f"{DB}/tables.json", {**meta, "columns": sql(
    "SELECT table_name, column_name, data_type, is_nullable, column_default "
    "FROM information_schema.columns WHERE table_schema='public' "
    "ORDER BY table_name, ordinal_position"),
    "rls_enabled": sql("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' ORDER BY tablename")})
write(f"{DB}/rls-policies.json", {**meta, "policies": sql(
    "SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check "
    "FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname")})
write(f"{DB}/constraints.json", {**meta, "constraints": sql(
    "SELECT conrelid::regclass::text AS table_name, conname, contype, pg_get_constraintdef(oid) AS definition "
    "FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1, 2")})
write(f"{DB}/indexes.json", {**meta, "indexes": sql(
    "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename, indexname")})
write(f"{DB}/functions.json", {**meta, "functions": sql(
    "SELECT proname, pg_get_functiondef(oid) AS definition FROM pg_proc "
    "WHERE pronamespace='public'::regnamespace ORDER BY proname")})
write(f"{DB}/triggers.json", {**meta, "triggers": sql(
    "SELECT event_object_table AS table_name, trigger_name, action_timing, event_manipulation, action_statement "
    "FROM information_schema.triggers WHERE trigger_schema='public' ORDER BY 1, 2")})
write(f"{DB}/views.json", {**meta, "views": sql(
    "SELECT viewname, definition FROM pg_views WHERE schemaname='public' ORDER BY viewname")})
write(f"{DB}/grants.json", {**meta, "grants": sql(
    "SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants "
    "WHERE table_schema='public' ORDER BY table_name, grantee, privilege_type")})
write(f"{DB}/extensions.json", {**meta, "extensions": sql("SELECT extname, extversion FROM pg_extension ORDER BY extname")})
write(f"{DB}/pg-cron.json", {**meta, "jobs": sql("SELECT jobid, schedule, command, database, active FROM cron.job")})
write(f"{DB}/vault-secrets.json", {**meta, "note": "names/descriptions only — never values",
    "secrets": sql("SELECT id, name, description FROM vault.secrets")})

tables = [r["tablename"] for r in sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")]
counts = sql(" UNION ALL ".join(f"SELECT '{t}' AS table_name, COUNT(*) AS rows FROM public.{t}" for t in tables))
write(f"{DB}/row-counts.json", {**meta, "counts": counts,
    "auth_users_count": sql("SELECT COUNT(*) AS rows FROM auth.users")})

safe_write("data/plans.json", lambda: sql("SELECT * FROM public.plans ORDER BY sort_order"), "pricing plans (live)")
safe_write("data/llm-models.json", lambda: sql("SELECT * FROM public.llm_models ORDER BY priority"), "LLM routing table (live)")
safe_write("data/agent-flags.json", lambda: sql("SELECT * FROM public.agent_flags ORDER BY key"), "agent kill switches (live)")
safe_write("data/sample-analysis-job.json", lambda: sql(
    "SELECT id, user_id, site_url, input, status, current_step, error, attempts, wait_reason, created_at, started_at, completed_at "
    "FROM public.analysis_jobs ORDER BY created_at DESC LIMIT 1"),
    "latest job, single row; step_outputs/step_log excluded (bulk — full report shape in reports/real_report_data.json)")
safe_write("data/sample-free-audits.json", lambda: sql("SELECT * FROM public.free_audits ORDER BY created_at DESC LIMIT 10"),
    "latest 10, IPs hashed by scrubber")
print("== Supabase snapshot done")
