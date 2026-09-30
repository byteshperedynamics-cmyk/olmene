#!/usr/bin/env python3
"""Dark-mode audit: homepage + sample-report at mobile/desktop, plus close-ups."""
from playwright.sync_api import sync_playwright
import os

BASE = "http://localhost:3000"
OUT = "/home/z/my-project/shots/audit"
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch()
    for route, name in [("/", "home"), ("/sample-report/", "sample"), ("/pricing/", "pricing"), ("/login/", "login")]:
        for w, h in [(390, 844), (1440, 900)]:
            ctx = b.new_context(viewport={"width": w, "height": h}, color_scheme="dark", device_scale_factor=2 if w == 1440 else 1)
            page = ctx.new_page()
            page.goto(BASE + route, wait_until="domcontentloaded")
            page.wait_for_timeout(1500)
            try:
                page.screenshot(path=f"{OUT}/dark_{name}_{w}.png", full_page=True)
            except Exception as e:
                print("shot failed", name, w, e)
            ctx.close()
    b.close()
print("done")
