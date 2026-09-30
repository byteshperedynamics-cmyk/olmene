#!/usr/bin/env python3
"""Find the source of '__name is not defined' page errors on production."""
from playwright.sync_api import sync_playwright

BASE = "https://get.marketwiselabs.workers.dev"
ROUTES = ["/", "/pricing/", "/sample-report/", "/login/", "/legal/privacy/", "/legal/terms/"]

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    page.on("pageerror", lambda e: print("PAGEERROR:", str(e)[:200], "\n  stack:", (e.stack or "").split("\n")[1] if e.stack and len(e.stack.split("\n"))>1 else "n/a"))
    page.on("console", lambda m: print("CONSOLE-ERR:", m.text[:200], m.location or "") if m.type == "error" else None)
    for route in ROUTES:
        print(f"--- {route}")
        try:
            page.goto(BASE + route, wait_until="domcontentloaded", timeout=40000)
            page.wait_for_timeout(3500)
        except Exception as ex:
            print("  nav error:", str(ex)[:100])
    browser.close()
