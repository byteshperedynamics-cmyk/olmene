#!/usr/bin/env python3
"""Probe: what does Playwright's headless Chromium report for hover/pointer media features?"""
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    for label, kwargs in [
        ("default", {}),
        ("touch", {"has_touch": True, "is_mobile": True, "viewport": {"width": 390, "height": 844}}),
    ]:
        ctx = browser.new_context(**kwargs)
        page = ctx.new_page()
        page.goto("about:blank")
        res = page.evaluate(
            "() => ({"
            "hoverHover: matchMedia('(hover: hover)').matches,"
            "pointerFine: matchMedia('(pointer: fine)').matches,"
            "anyHover: matchMedia('(any-hover: hover)').matches,"
            "anyPointerFine: matchMedia('(any-pointer: fine)').matches,"
            "combined: matchMedia('(hover: hover) and (pointer: fine)').matches"
            "})"
        )
        print(label, "->", res)
        ctx.close()
    browser.close()
