#!/usr/bin/env python3
"""Debug: watch document.title over time on /pricing with Greek stored."""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context()
    page = ctx.new_page()
    page.goto("http://localhost:3000/", wait_until="domcontentloaded")
    page.evaluate("localStorage.setItem('mw-lang','el')")
    page.goto("http://localhost:3000/pricing/", wait_until="domcontentloaded")
    for i in range(10):
        page.wait_for_timeout(300)
        title = page.title()
        lang = page.eval_on_selector("html", "el => el.lang")
        nav = page.locator("nav").first.inner_text()
        print(f"t={i*300}ms title={title!r} lang={lang} nav={nav[:20]!r}")
    b.close()
