#!/usr/bin/env python3
"""Bisect the homepage WebKit crash: hide candidate elements via injected CSS."""
from playwright.sync_api import sync_playwright
import sys

SELECTOR = sys.argv[1]
ROUTE = sys.argv[2] if len(sys.argv) > 2 else "/"
HIDE_CSS = f"<style>{SELECTOR}{{display:none!important}}</style>"
BASE = "https://get.marketwiselabs.workers.dev"

with sync_playwright() as p:
    b = p.webkit.launch(headless=False)
    ctx = b.new_context()
    pg = ctx.new_page()

    def inject(route):
        resp = route.fetch()
        body = resp.text()
        body = body.replace("</head>", HIDE_CSS + "</head>", 1)
        route.fulfill(status=resp.status, headers={"content-type": "text/html"}, body=body)

    def handler(route):
        if route.request.resource_type == "document":
            inject(route)
        else:
            route.continue_()

    pg.route(f"{BASE}/**", handler)
    try:
        pg.goto(f"{BASE}{ROUTE}", timeout=30000, wait_until="domcontentloaded")
        pg.wait_for_timeout(3500)
        txt = pg.locator("body").inner_text()[:40].replace("\n", " ")
        print(f"NO-CRASH (hidden: {SELECTOR}) → '{txt}'")
    except Exception as e:
        print(f"CRASH (hidden: {SELECTOR}) → {str(e)[:60]}")
    b.close()
