#!/usr/bin/env python3
"""Full-site visual audit: overflow scan + section screenshots of the fixed
Example diagnosis card, across routes and viewports."""
from playwright.sync_api import sync_playwright
import os

BASE = "http://localhost:3000"
OUT = "/home/z/my-project/shots/audit"
os.makedirs(OUT, exist_ok=True)

ROUTES = ["/", "/pricing/", "/sample-report/", "/login/", "/legal/privacy/", "/legal/terms/"]
VIEWPORTS = [(320, 700), (390, 844), (768, 900), (1440, 900)]

JS = """
(() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    // sr-only (skip link) intentionally parks at left:-1px — not an overflow
    if (el.classList.contains("sr-only")) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const bad = [];
    if (r.right > vw + 0.5) bad.push(`right+${Math.round(r.right - vw)}`);
    if (r.left < -0.5) bad.push(`left-${Math.round(-r.left)}`);
    if (bad.length) out.push({
      tag: el.tagName, cls: (typeof el.className === "string" ? el.className : "").slice(0, 110),
      text: (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 50), bad: bad.join(","),
    });
  }
  return {vw, sw: document.documentElement.scrollWidth, out: out.slice(0, 30)};
})()
"""

with sync_playwright() as p:
    b = p.chromium.launch()
    summary = {}
    for route in ROUTES:
        for w, h in VIEWPORTS:
            ctx = b.new_context(viewport={"width": w, "height": h})
            page = ctx.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)[:100]))
            try:
                page.goto(BASE + route, wait_until="domcontentloaded", timeout=30000)
                page.wait_for_timeout(1200)
            except Exception as e:
                print(f"!! {route} @{w}: {e}")
                ctx.close()
                continue
            res = page.evaluate(JS)
            key = f"{route}@{w}"
            summary[key] = {"sw": res["sw"], "n": len(res["out"]), "errs": errors}
            if res["out"]:
                print(f"\n>>> OVERFLOW {route} @{w}px (docSW={res['sw']}, vw={res['vw']})")
                for c in res["out"]:
                    print(f"    <{c['tag']}> {c['bad']} | {c['text']!r} | {c['cls'][:80]}")
            if errors:
                print(f"    JS ERRORS: {errors}")
            ctx.close()

    # Screenshot the fixed Example diagnosis card
    for w, h in [(390, 844), (768, 900), (1440, 900)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2)
        page = ctx.new_page()
        page.goto(BASE + "/", wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        el = page.locator("p", has_text="Example diagnosis").first
        el.scroll_into_view_if_needed()
        page.wait_for_timeout(700)
        box = el.bounding_box()
        if box:
            page.screenshot(path=f"{OUT}/fixed_diag_{w}.png",
                            clip={"x": 0, "y": max(0, box["y"] - 20), "width": w, "height": 700})
        # full page shots for VLM review (desktop + mobile only, keep volume sane)
        if w in (390, 1440):
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(400)
            try:
                page.screenshot(path=f"{OUT}/home_{w}_full.png", full_page=True)
            except Exception:
                pass
        ctx.close()

    # full page shots of other routes (1440 only)
    for route in ["/pricing/", "/sample-report/", "/login/"]:
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.goto(BASE + route, wait_until="domcontentloaded")
        page.wait_for_timeout(1200)
        try:
            page.screenshot(path=f"{OUT}/{route.strip('/').replace('/', '_')}_1440_full.png", full_page=True)
        except Exception as e:
            print("full-page shot failed:", route, e)
        ctx.close()
    b.close()

print("\n===== SUMMARY =====")
clean = sum(1 for v in summary.values() if v["n"] == 0 and not v["errs"])
print(f"{clean}/{len(summary)} route@viewport combos clean (no overflow, no JS errors)")
for k, v in summary.items():
    if v["n"] or v["errs"]:
        print(f"  {k}: {v['n']} overflow, errs={v['errs']}")
