#!/usr/bin/env python3
"""Programmatic z-order check: the open panel must be the topmost element
at points where the animated hero text (h1/subtitle) is behind it."""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
    page.goto(BASE + "/", wait_until="networkidle")
    page.locator("button[aria-haspopup='listbox']").first.click()
    page.wait_for_timeout(400)

    result = page.evaluate(
        """() => {
        const panel = document.querySelector('.lang-panel');
        const r = panel.getBoundingClientRect();
        // probe several points across the panel where hero text sits behind
        const probes = [
            [r.x + r.width / 2, r.y + 20],       // over h1 region
            [r.x + r.width / 2, r.y + r.height / 2],
            [r.x + r.width / 2, r.y + r.height - 20],
        ];
        return probes.map(([x, y]) => {
            const el = document.elementFromPoint(x, y);
            return {
                inPanel: !!(el && el.closest('.lang-panel')),
                tag: el ? el.tagName + '.' + (el.className || '').toString().slice(0, 30) : 'none',
            };
        });
    }"""
    )
    print("probes:", result)
    ok = all(p_["inPanel"] for p_ in result)
    print("Z-ORDER:", "PASS — panel is topmost everywhere" if ok else "FAIL — something paints above the panel")
    browser.close()
    exit(0 if ok else 1)
