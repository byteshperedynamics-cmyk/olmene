#!/usr/bin/env python3
"""Live-site audit: overflow scan + JS errors + polish-item checks on production."""
from playwright.sync_api import sync_playwright
import json

BASE = "https://get.marketwiselabs.workers.dev"
ROUTES = ["/", "/pricing/", "/sample-report/", "/login/", "/legal/privacy/", "/legal/terms/"]
VIEWPORTS = [(320, 700), (390, 844), (768, 900), (1440, 900)]

JS = """
(() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    // sr-only / clipped elements are intentionally off-screen — skip them
    if (el.classList.contains("sr-only")) continue;
    if (cs.clipPath && cs.clipPath !== "none") continue;
    if (cs.width === "1px" && cs.height === "1px" && cs.overflow === "hidden") continue;
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
  return JSON.stringify(out.slice(0, 8));
})()
"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    total_fail = 0
    for w, h in VIEWPORTS:
        ctx = browser.new_context(viewport={"width": w, "height": h})
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:120]))
        pending = []

        def _track(r):
            pending.append(r.url[:110])

        def _untrack(r):
            u = r.url[:110]
            if u in pending:
                pending.remove(u)

        page.on("request", _track)
        page.on("requestfinished", _untrack)
        page.on("requestfailed", _untrack)
        for route in ROUTES:
            page.goto(BASE + route, wait_until="domcontentloaded", timeout=45000)
            try:
                page.wait_for_load_state("networkidle", timeout=12000)
            except Exception:
                print(f"  (networkidle timeout on {route}; pending: {pending[:3]})")
            page.wait_for_timeout(600)
            issues = page.evaluate(JS)
            if issues != "[]" or errors:
                total_fail += 1
                print(f"FAIL {w}x{h} {route}")
                if issues != "[]":
                    print("  overflow:", issues[:400])
                if errors:
                    print("  js errors:", errors[:2])
            else:
                print(f"PASS {w}x{h} {route}")
        ctx.close()

    # Polish checks on homepage (desktop)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.goto(BASE + "/", wait_until="networkidle", timeout=45000)
    checks = page.evaluate("""
    (() => {
      const skip = document.querySelector('a[href="#main-content"]');
      let skipVisible = false;
      if (skip) { skip.focus(); const r = skip.getBoundingClientRect(); skipVisible = r.width > 0 && r.height > 0; }
      const smooth = getComputedStyle(document.documentElement).scrollBehavior;
      const anchored = [...document.querySelectorAll('#demo, #how-it-works, #whats-inside, #pricing-teaser, #faq')]
        .every(el => getComputedStyle(el).scrollMarginTop !== '0px');
      const main = document.getElementById('main-content');
      return JSON.stringify({skipLinkPresent: !!skip, skipVisibleOnFocus: skipVisible,
        smoothScroll: smooth, anchoredSectionsOffset: anchored, mainContentId: !!main});
    })()
    """)
    print("polish:", checks)
    ctx.close()
    browser.close()
    print("TOTAL FAILURES:", total_fail)
