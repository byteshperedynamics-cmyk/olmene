#!/usr/bin/env python3
"""Live pipeline benchmark — RESUMABLE / CHUNKED.

The sandbox kills background processes between tool calls, so the bench runs
in ~8-minute foreground chunks. Each invocation of:

    python3 bench.py <variant> [args]

loads state, refreshes the test user's token, resumes any half-finished job,
runs as many pending site-analyses as fit in the chunk, and exits. Re-invoke
until it prints ALL RUNS DONE; it then writes the summary JSON.

Files (under scripts/pipeline_tests/results/):
  bench_state_<variant>.json   credentials + site progress
  bench_runs_<variant>.jsonl   one JSON record per completed run
  live_<variant>.json          final summary (written once all runs done)

Variant "baseline" ran against deployed advance-analysis v29 (pre-enhancement);
"enhanced" runs after deploying the patched function.
"""
import argparse, json, sys, time, urllib.request, urllib.error, datetime, statistics, uuid, os

sys.path.insert(0, "/home/z/my-project/scripts")
from db_query import q as _q  # Management-API SQL


def q(sql):
    """q() that RAISES on SQL errors (raw q() swallows them)."""
    r = _q(sql)
    if isinstance(r, dict) and "error" in r:
        raise RuntimeError(f"SQL failed: {r.get('body', r)[:300]} :: {sql[:120]}")
    return r


SB = "https://ffoevhldpppyfsfgufmx.supabase.co"
FN = SB + "/functions/v1"
PUBKEY = "sb_publishable_CQJaLHGkc60GML5ccdWfdQ_8wO6PdTq"
PAT = "sbp_REDACTED_FOR_EXPORT"
REF = "ffoevhldpppyfsfgufmx"
PASSWORD = "QaTest!2026x"
ADVANCE_TIMEOUT = 200  # chained invocations can legitimately take ~90-120 s
RUN_TIMEOUT = 420      # per-run hard cap (s) — direct-drive runs take 0.5-3 min
CHUNK_BUDGET_S = 480   # stop chunk cleanly before the 10-min tool timeout

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "results")

DEFAULT_SITES = [
    "https://get.marketwiselabs.workers.dev",
    "https://trisle-app.github.io/Trisle_Website/",
    "https://linear.app",
    # self site a second time -> score variance between repeat runs
    "https://get.marketwiselabs.workers.dev",
]


def http(url, data=None, headers=None, method=None, timeout=30):
    r = urllib.request.Request(
        url, data=json.dumps(data).encode() if data is not None else None,
        headers=headers or {}, method=method or ("POST" if data is not None else "GET"))
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return json.load(resp)


def post_fn(path, body, token, timeout=ADVANCE_TIMEOUT):
    h = {"Content-Type": "application/json", "apikey": PUBKEY,
         "Authorization": f"Bearer {token}"}
    try:
        return http(FN + path, body, h, timeout=timeout)
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode() or "{}")


def auth_post(path, body):
    h = {"Content-Type": "application/json", "apikey": PUBKEY}
    try:
        return http(SB + path, body, h)
    except urllib.error.HTTPError as e:
        return json.loads(e.read().decode() or "{}")


def signin(email):
    sess = auth_post("/auth/v1/token?grant_type=password", {"email": email, "password": PASSWORD})
    if not sess.get("access_token"):
        raise SystemExit(f"signin failed: {json.dumps(sess)[:300]}")
    return sess["access_token"]


def make_test_user(tag):
    email = f"qa.bench.{tag}.{int(time.time())}@mailinator.com"
    signup = auth_post("/auth/v1/signup", {"email": email, "password": PASSWORD})
    user_id = (signup.get("user") or {}).get("id") or signup.get("id")
    if not user_id:
        raise SystemExit(f"signup failed: {json.dumps(signup)[:300]}")
    q(f"update auth.users set email_confirmed_at = now() where id = '{user_id}'")
    return email, user_id, signin(email)


def starter_product_id():
    rows = q("select polar_product_id from plans where one_time = false order by reports_per_period desc limit 1")
    return rows[0]["polar_product_id"]


def budget_snapshot():
    rows = q("select key, count from usage_counters where key like 'tavily:%' or key like 'llm:%'")
    return {r["key"]: r["count"] for r in rows}


def iso_dur(a, b):
    ta = datetime.datetime.fromisoformat(a.replace("Z", "+00:00"))
    tb = datetime.datetime.fromisoformat(b.replace("Z", "+00:00"))
    return (tb - ta).total_seconds()


def budget_deltas(b0, b1):
    tav = sum((b1.get(k) or 0) - (b0.get(k) or 0) for k in set(b0) | set(b1) if k.startswith("tavily:"))
    llm = sum((b1.get(k) or 0) - (b0.get(k) or 0) for k in set(b0) | set(b1) if k.startswith("llm:") and not k.startswith("llmrpm"))
    return {"tavily": tav, "llm": llm}


def collect_run_metrics(job_id, site, wall_client, b0, b1):
    job = q(f"select * from analysis_jobs where id = '{job_id}'")[0]
    steps = []
    for e in (job.get("step_log") or []):
        dur = iso_dur(e["startedAt"], e["endedAt"]) if e.get("startedAt") and e.get("endedAt") else 0
        steps.append({"step": e["step"], "dur": round(dur, 1), "model": e.get("model", "")})
    ordered = [e for e in (job.get("step_log") or []) if e.get("endedAt") and e.get("startedAt")]
    gaps = [iso_dur(p["endedAt"], n["startedAt"]) for p, n in zip(ordered, ordered[1:])]
    wall_server = iso_dur(job["created_at"], job["completed_at"]) if job.get("completed_at") else None

    so = job.get("step_outputs") or {}
    report_row = q(f"select data from reports where job_id = '{job_id}'")
    rep = report_row[0]["data"] if report_row else None

    valid_ids = {s["id"] for s in (so.get("research") or {}).get("sources", [])}
    cited, invalid = 0, 0
    if rep:
        def walk(o):
            nonlocal cited, invalid
            if isinstance(o, dict):
                for k, v in o.items():
                    if k == "sourceIds" and isinstance(v, list):
                        for sid in v:
                            if sid in valid_ids:
                                cited += 1
                            else:
                                invalid += 1
                    else:
                        walk(v)
            elif isinstance(o, list):
                for x in o:
                    walk(x)
        walk(rep)

    comps = (so.get("competitors_analyze") or {}).get("competitors", [])
    findings = 0
    if rep:
        a = rep.get("audit", {})
        findings = sum(len(a.get(k, [])) for k in ("messaging", "conversion", "trust", "pricingPresentation")) + len(a.get("seo", {}).get("findings", []))
    seo_checks = None
    if rep:
        seo_checks = len(((rep.get("audit") or {}).get("seo") or {}).get("checklist") or [])

    return {
        "site": site, "jobId": job_id, "status": job["status"], "error": job.get("error"),
        "wall_client_s": round(wall_client, 1), "wall_server_s": round(wall_server, 1) if wall_server else None,
        "step_work_s": round(sum(s["dur"] for s in steps), 1),
        "gap_s": round(sum(gaps), 1),
        "steps": steps,
        "attempts": job.get("attempts"),
        "pages_crawled": len((so.get("crawl") or {}).get("pages", [])),
        "sources": len((so.get("research") or {}).get("sources", [])),
        "competitor_picks": len((so.get("competitors_pick") or {}).get("competitors", [])),
        "competitors_analyzed": len(comps),
        "competitors_with_pricing": sum(1 for c in comps if c.get("pricing")),
        "findings": findings,
        "seo_checklist_entries": seo_checks,
        "citations_valid_pct": round(100 * cited / (cited + invalid), 1) if (cited + invalid) else None,
        "scores": rep.get("executiveSummary", {}).get("scores") if rep else None,
        "llm_models_used": sorted({s["model"] for s in steps if s["model"]}),
        "budget": budget_deltas(b0, b1),
    }


def drive_job(job_id, site, token, t0, b0):
    """Poll advance-analysis until terminal state, then collect metrics."""
    backoff = 0.5
    while True:
        if time.time() - t0 > RUN_TIMEOUT:
            q(f"update analysis_jobs set status='canceled', error='bench run timeout' where id='{job_id}' and status in ('queued','running')")
            return None
        r = post_fn("/advance-analysis", {"jobId": job_id}, token)
        status = r.get("status")
        if status in ("completed", "failed", "canceled"):
            break
        if "error" in r:
            time.sleep(backoff)
            backoff = min(backoff * 2, 30)
        else:
            time.sleep(0.5)
    b1 = budget_snapshot()
    return collect_run_metrics(job_id, site, time.time() - t0, b0, b1)


def start_and_drive(site, token):
    b0 = budget_snapshot()
    t0 = time.time()
    started = post_fn("/start-analysis", {
        "siteUrl": site, "productName": "", "targetMarket": "",
        "knownCompetitors": [], "goal": "grow_revenue", "language": "English",
    }, token, timeout=30)
    if "jobId" not in started:
        return {"site": site, "error": json.dumps(started)[:200], "status": "start_failed"}
    return drive_job(started["jobId"], site, token, t0, b0)


def resume_pending_job(token, user_id):
    """If a previous chunk died mid-run, drive that job to completion first."""
    rows = q(f"select id, site_url, status from analysis_jobs where user_id='{user_id}' and status in ('queued','running') order by created_at desc limit 1")
    if not rows:
        return None
    job = rows[0]
    print(f"resuming pending job {job['id'][:8]} for {job['site_url'][:40]}", flush=True)
    b0 = budget_snapshot()
    return drive_job(job["id"], job["site_url"], token, time.time(), b0)


def load_state(variant):
    path = os.path.join(RESULTS, f"bench_state_{variant}.json")
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return None


def save_state(variant, state):
    with open(os.path.join(RESULTS, f"bench_state_{variant}.json"), "w") as f:
        json.dump(state, f, indent=2)


def append_run(variant, record):
    with open(os.path.join(RESULTS, f"bench_runs_{variant}.jsonl"), "a") as f:
        f.write(json.dumps(record, default=str) + "\n")


def existing_runs(variant):
    path = os.path.join(RESULTS, f"bench_runs_{variant}.jsonl")
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def summarize(variant):
    runs = existing_runs(variant)
    ok = [r for r in runs if r.get("status") == "completed"]
    summary = {
        "variant": variant,
        "runs_total": len(runs),
        "runs_completed": len(ok),
        "mean_wall_s": round(statistics.mean(r["wall_server_s"] for r in ok), 1) if ok else None,
        "mean_step_work_s": round(statistics.mean(r["step_work_s"] for r in ok), 1) if ok else None,
        "mean_gap_s": round(statistics.mean(r["gap_s"] for r in ok), 1) if ok else None,
        "mean_sources": round(statistics.mean(r["sources"] for r in ok), 1) if ok else None,
        "min_competitors": min((r["competitors_analyzed"] for r in ok), default=None),
        "mean_competitors": round(statistics.mean(r["competitors_analyzed"] for r in ok), 1) if ok else None,
        "pricing_found_pct": round(100 * statistics.mean(
            [r["competitors_with_pricing"] / r["competitors_analyzed"] for r in ok if r["competitors_analyzed"]]), 1) if ok else None,
        "mean_findings": round(statistics.mean(r["findings"] for r in ok), 1) if ok else None,
        "seo_checklist_entries": sorted({r["seo_checklist_entries"] for r in ok if r["seo_checklist_entries"]}),
        "citations_valid_pct": round(statistics.mean(r["citations_valid_pct"] for r in ok if r["citations_valid_pct"] is not None), 1) if ok else None,
        "tavily_credits": sum(r.get("budget", {}).get("tavily", 0) for r in runs),
        "llm_calls": sum(r.get("budget", {}).get("llm", 0) for r in runs),
    }
    # same-site repeat score variance (marketwise runs)
    mw = [r for r in ok if "marketwise" in r["site"]]
    if len(mw) >= 2:
        for dim in ("overall", "seo"):
            vals = [r["scores"][dim] for r in mw if r.get("scores")]
            if len(vals) >= 2:
                summary[f"score_spread_{dim}"] = max(vals) - min(vals)
    out = {"summary": summary, "runs": runs}
    with open(os.path.join(RESULTS, f"live_{variant}.json"), "w") as f:
        json.dump(out, f, indent=2, default=str)
    print("\n=== summary", json.dumps(summary, indent=2))
    return summary


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("variant")
    ap.add_argument("--sites", default=",".join(DEFAULT_SITES))
    ap.add_argument("--summarize-only", action="store_true")
    args = ap.parse_args()
    sites = [s.strip() for s in args.sites.split(",") if s.strip()]

    if args.summarize_only:
        summarize(args.variant)
        return

    state = load_state(args.variant)
    if state is None:
        email, user_id, token = make_test_user(args.variant)
        plan = starter_product_id()
        now = datetime.datetime.now(datetime.UTC)
        q(f"""insert into subscriptions (id, user_id, polar_subscription_id, polar_customer_id,
            polar_product_id, status, current_period_start, current_period_end, cancel_at_period_end, last_event_at, updated_at)
            values ('{uuid.uuid4()}', '{user_id}', 'bench_sub_{int(time.time())}', 'bench_cust',
            '{plan}', 'active', '{now.isoformat()}', '{(now + datetime.timedelta(days=30)).isoformat()}', false, now(), now())""")
        assert q(f"select count(*) as n from subscriptions where user_id='{user_id}' and status='active'")[0]["n"] == 1
        state = {"email": email, "user_id": user_id, "sites": sites, "done": [False] * len(sites)}
        save_state(args.variant, state)
        print(f"test user: {email}")
    else:
        token = signin(state["email"])
        print(f"resumed user: {state['email']}")

    user_id = state["user_id"]
    t_chunk = time.time()

    # 1) resume any half-finished job from a killed chunk
    rec = resume_pending_job(token, user_id)
    if rec:
        append_run(args.variant, rec)
        site = rec["site"]
        for i, s in enumerate(state["sites"]):
            if s == site and not state["done"][i]:
                state["done"][i] = True
        save_state(args.variant, state)
        print("resumed run:", json.dumps({k: v for k, v in rec.items() if k != "steps"})[:300], flush=True)

    # 2) run pending sites until the chunk budget is spent
    ran_this_chunk = 0
    for i, site in enumerate(state["sites"]):
        if state["done"][i]:
            continue
        if time.time() - t_chunk > CHUNK_BUDGET_S:
            print(f"CHUNK BUDGET SPENT: {sum(state['done'])}/{len(state['sites'])} done. Re-run this command to continue.", flush=True)
            return
        print(f"--- run {i + 1}/{len(state['sites'])}: {site}", flush=True)
        rec = start_and_drive(site, token)
        if rec is None:
            print("run timed out and was canceled; will not retry", flush=True)
            state["done"][i] = True  # don't loop forever on a stuck site
            save_state(args.variant, state)
            continue
        append_run(args.variant, rec)
        state["done"][i] = True
        save_state(args.variant, state)
        ran_this_chunk += 1
        print(json.dumps({k: v for k, v in rec.items() if k != "steps"}, default=str)[:400], flush=True)

    if all(state["done"]):
        print(f"ALL RUNS DONE ({ran_this_chunk} this chunk)", flush=True)
        summarize(args.variant)
    else:
        print(f"PROGRESS: {sum(state['done'])}/{len(state['sites'])}", flush=True)


if __name__ == "__main__":
    main()
