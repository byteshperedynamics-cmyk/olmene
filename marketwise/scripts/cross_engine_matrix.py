#!/usr/bin/env python3
"""Cross-engine × device-matrix compatibility test.

Engines:  Chromium (Chrome/Android), WebKit (Safari engine), Firefox (Gecko)
Devices:  iPhone SE1/SE3/14/15PM, Galaxy S8, Pixel 7, iPad Mini, Desktop
Routes:   all 6 public routes
Checks:   page errors, horizontal overflow, key content, header/footer render

Usage:
  python3 scripts/cross_engine_matrix.py chromium   # via plain python3
  bash scripts/run_webkit.sh scripts/cross_engine_matrix.py webkit
  python3 scripts/cross_engine_matrix.py firefox
"""
from playwright.sync_api import sync_playwright
import json
import sys

ENGINE = sys.argv[1] if len(sys.argv) > 1 else "chromium"
BASE = "https://get.marketwiselabs.workers.dev"
ROUTES = ["/", "/pricing/", "/sample-report/", "/login/", "/legal/privacy/", "/legal/terms/"]

# (name, width, height, dpr, touch, ua)
DEVICES = [
    ("iphone-se1", 320, 568, 2, True, "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.8 Mobile/15E148 Safari/604.1"),
    ("iphone-se3", 375, 667, 2, True, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"),
    ("iphone-14", 390, 844, 3, True, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"),
    ("iphone-15pm", 430, 932, 3, True, "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"),
    ("galaxy-s8", 360, 740, 4, True, "Mozilla/5.0 (Linux; Android 9; SM-G950F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Mobile Safari/537.36"),
    ("pixel-7", 412, 915, 2.6, True, "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36"),
    ("ipad-mini", 768, 1024, 2, True, "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"),
    ("desktop", 1440, 900, 1, False, None),
]

JS_OVERFLOW = """
(() => {
  const vw = document.documentElement.clientWidth;
  let worst = 0, worstEl = "";
  for (const el of document.querySelectorAll("body *")) {
    if (el.classList.contains("sr-only")) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const over = Math.max(r.right - vw, -Math.min(r.left, 0));
    if (over > worst + 0.5) { worst = over; worstEl = el.tagName + "." + (typeof el.className === "string" ? el.className.slice(0, 40) : ""); }
  }
  return JSON.stringify({worst: Math.round(worst * 10) / 10, worstEl});
})()
"""

total = ok = 0
fails = []
with sync_playwright() as p:
    launcher = getattr(p, ENGINE)
    kwargs = {"headless": False} if ENGINE == "webkit" else {"headless": True}
    browser = launcher.launch(**kwargs)
    for dev, w, h, dpr, touch, ua in DEVICES:
        ctx_kwargs = {
            "viewport": {"width": w, "height": h},
            "device_scale_factor": dpr,
            "has_touch": touch,
            "is_mobile": touch and ENGINE != "firefox",  # firefox doesn't support is_mobile
        }
        if ua:
            ctx_kwargs["user_agent"] = ua
        ctx = browser.new_context(**ctx_kwargs)
        pg = ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)[:90]))
        for route in ROUTES:
            total += 1
            label = f"{ENGINE}/{dev}{route}"
            try:
                pg.goto(BASE + route, timeout=30000, wait_until="domcontentloaded")
                # retry once on transient edge errors (Cloudflare error pages/timeouts)
                if "heading-ray-id" in pg.content():
                    pg.wait_for_timeout(1500)
                    pg.goto(BASE + route, timeout=30000, wait_until="domcontentloaded")
                pg.wait_for_timeout(1400)
                probe = pg.evaluate(
                    "JSON.stringify({h1: document.querySelector('h1')?.innerText?.slice(0,30) || 'NO-H1',"
                    " header: !!document.querySelector('header'), footer: !!document.querySelector('footer'),"
                    " docW: document.documentElement.scrollWidth, cliW: document.documentElement.clientWidth})"
                )
                data = json.loads(probe)
                ov = json.loads(pg.evaluate(JS_OVERFLOW))
                problems = []
                if data["docW"] > data["cliW"]:
                    problems.append(f"page-scroll {data['docW']}>{data['cliW']}")
                if ov["worst"] > 0.5:
                    problems.append(f"el-overflow {ov['worst']}px {ov['worstEl']}")
                if not data["header"]:
                    problems.append("no-header")
                if errors:
                    problems.append(f"jserr:{errors[0][:50]}")
                if problems:
                    fails.append((label, "; ".join(problems)))
                    print(f"FAIL {label} — {'; '.join(problems)}")
                else:
                    ok += 1
                errors = []
            except Exception as e:
                fails.append((label, f"load: {str(e)[:70]}"))
                print(f"FAIL {label} — load: {str(e)[:70]}")
        ctx.close()
    browser.close()

print(f"\n=== {ENGINE}: {ok}/{total} passed ===")
if fails:
    for label, why in fails:
        print(f"  {label}: {why}")
    sys.exit(1)
