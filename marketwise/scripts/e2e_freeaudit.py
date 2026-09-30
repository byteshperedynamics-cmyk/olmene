#!/usr/bin/env python3
"""E2E: run the free audit form locally, screenshot the result card
(with the fixed ScoreRing) at mobile + desktop."""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"

with sync_playwright() as p:
    b = p.chromium.launch()
    for w, h in [(390, 844), (1440, 900)]:
        ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2)
        page = ctx.new_page()
        page.goto(BASE + "/", wait_until="domcontentloaded")
        page.wait_for_timeout(1200)
        page.fill("input[aria-label='Your website URL']", "example.com")
        page.click("button[type=submit]")
        # wait for the diagnosis result (edge function call)
        try:
            page.wait_for_selector("#diagnosis", timeout=60000)
            page.wait_for_timeout(2500)
        except Exception as e:
            print(f"{w}: diagnosis did not appear:", e)
            page.screenshot(path=f"/home/z/my-project/shots/audit/freeaudit_fail_{w}.png", full_page=True)
            ctx.close()
            continue
        el = page.locator("#diagnosis")
        el.scroll_into_view_if_needed()
        page.wait_for_timeout(800)
        box = el.bounding_box()
        if box:
            page.screenshot(path=f"/home/z/my-project/shots/audit/freeaudit_{w}.png",
                            clip={"x": 0, "y": max(0, box["y"] - 30), "width": w,
                                  "height": min(1100, box["height"] + 60)})
        # also verify: caption below ring, not colliding
        m = page.evaluate("""
        () => {
          const fig = document.querySelector('#diagnosis figure');
          if (!fig) return null;
          const fr = fig.getBoundingClientRect();
          const svg = fig.querySelector('svg');
          const cap = fig.querySelector('figcaption');
          const sr = svg?.getBoundingClientRect();
          const cr = cap?.getBoundingClientRect();
          return {fig: {top: fr.top, bottom: fr.bottom, w: fr.width},
                  svg: sr ? {top: sr.top, bottom: sr.bottom, w: sr.width} : null,
                  cap: cr ? {top: cr.top, bottom: cr.bottom, w: cr.width} : null,
                  capBelowSvg: sr && cr ? cr.top >= sr.bottom - 1 : null};
        }
        """)
        print(f"{w}px:", m)
        ctx.close()
    b.close()
