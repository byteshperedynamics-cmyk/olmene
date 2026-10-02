#!/usr/bin/env python3
"""Score local full-analysis runs (outputs of scripts/pipeline-eval/run.ts).

usage: python3 scripts/pipeline-eval/score.py out1.json [out2.json …]

Per run: status, wall time, which model answered each LLM step, competitors
(name, homepage, whether the domain matches the brand), cited sources that
still resolve, and report claims that contradict the crawl's own facts.
"""
import json
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = {"User-Agent": "Mozilla/5.0 (compatible; OlmeneBot/1.0; +https://olmene.com)"}


def status_of(url):
    try:
        req = urllib.request.Request(url, headers=UA, method="GET")
        with urllib.request.urlopen(req, timeout=12) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0


def brand_match(name, url):
    token = re.sub(r"\b(inc|ltd|llc|gmbh|ai|app|hq|io|the)\b", " ", name.lower())
    token = "".join(re.findall(r"[a-z0-9]+", token))
    host = re.sub(r"^https?://(www\.)?", "", url).split("/")[0]
    bare = re.sub(r"[^a-z0-9]", "", ".".join(host.split(".")[:-1]))
    return len(token) >= 3 and (token in bare or (bare in token and len(bare) >= 4))


for path in sys.argv[1:]:
    d = json.load(open(path))
    print(f"\n=== {path}")
    if "failed" in d:
        print(f"  FAILED: {d['failed'][:200]}  (got to: {', '.join(d.get('timing', {}).keys())})")
        continue
    r = d["report"]
    used = {k: v[-1] for k, v in d["models"].items() if v}
    print(f"  time {d['totalMs'] / 1000:.0f}s | score {r['executiveSummary']['scores']['overall']} | models: {used}")
    print(f"  category: {d['stepOutputs']['profile'].get('category')}")
    comps = r.get("competitors") or []
    print(f"  competitors ({len(comps)}):")
    for c in comps:
        ok = brand_match(c["name"], c["url"])
        print(f"    {'✓' if ok else '✗'} {c['name']:<22} {c['url']:<40} threat={c.get('threat')} | {c.get('positioning', '')[:80]}")
    srcs = r.get("sources") or []
    with ThreadPoolExecutor(8) as ex:
        codes = list(ex.map(lambda s: status_of(s["url"]), srcs))
    dead = [s["url"] for s, c in zip(srcs, codes) if c and c >= 400 and c not in (401, 403, 429)]
    print(f"  sources: {len(srcs)} cited, {len(dead)} dead {dead[:3]}")
    seo = d["stepOutputs"]["crawl"]["seoSignals"]
    findings = " ".join(str(f) for f in r["executiveSummary"].get("topFindings", [])).lower()
    contradictions = []
    if seo.get("ctaButtons") and re.search(r"\b(no|missing|lack of|add (a |visible )?(primary )?)\b[^.]{0,30}\bcta", findings):
        contradictions.append(f"claims missing CTA but crawl found {seo['ctaButtons'][:2]}")
    if seo.get("hasPricingPage") and re.search(r"(no|missing|hidden) pricing", findings):
        contradictions.append("claims hidden pricing but crawl found a pricing link")
    print(f"  contradictions: {contradictions or 'none'}")
    for f in r["executiveSummary"].get("topFindings", [])[:4]:
        print(f"    • {str(f)[:140]}")
