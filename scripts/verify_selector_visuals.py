#!/usr/bin/env python3
"""Visual verification of the polished language selector + centered demo section.

Captures: desktop hero (globe), open panel, dark mode, footer (up-variant),
RTL Arabic panel, mobile touch (native pill), and the centered demo section.
"""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = "/home/z/my-project/scratch"

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1. Desktop hero with globe
    page.goto(BASE + "/", wait_until="networkidle")
    page.screenshot(path=f"{OUT}/v-hero-desktop.png")

    # 2. Panel open (desktop)
    page.locator("button[aria-haspopup='listbox']").first.click()
    page.wait_for_timeout(350)
    page.screenshot(path=f"{OUT}/v-panel-open.png")

    # check panel is inside viewport
    panel = page.locator(".lang-panel")
    box = panel.bounding_box()
    print("panel box:", box)
    assert box and box["x"] >= 0 and box["x"] + box["width"] <= 1440, "panel overflows horizontally!"

    # 3. Close via Escape, then dark mode panel
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    page.emulate_media(color_scheme="dark")
    page.locator("button[aria-haspopup='listbox']").first.click()
    page.wait_for_timeout(350)
    page.screenshot(path=f"{OUT}/v-panel-dark.png")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    page.emulate_media(color_scheme="light")

    # 4. Arabic RTL panel
    page.evaluate("localStorage.setItem('mw-lang','ar')")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(900)
    page.locator("button[aria-haspopup='listbox']").first.click()
    page.wait_for_timeout(350)
    page.screenshot(path=f"{OUT}/v-panel-rtl-ar.png")
    box = page.locator(".lang-panel").bounding_box()
    print("RTL panel box:", box)
    assert box and box["x"] >= 0 and box["x"] + box["width"] <= 1440, "RTL panel overflows!"
    page.keyboard.press("Escape")
    page.evaluate("localStorage.clear()")

    # 5. Footer up-variant panel (scroll to footer)
    page.reload(wait_until="networkidle")
    # The cookie banner (fixed bottom overlay) intercepts footer clicks — dismiss it.
    try:
        page.locator("[role=dialog] button", has_text="Reject").first.click(timeout=2000)
        page.wait_for_timeout(400)
    except Exception:
        pass
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(600)
    page.locator("footer button[aria-haspopup='listbox']").first.click()
    page.wait_for_timeout(350)
    page.screenshot(path=f"{OUT}/v-panel-footer-up.png")
    box = page.locator(".lang-panel").bounding_box()
    print("footer panel box:", box)
    assert box and box["y"] >= 0, "footer panel above viewport top!"
    page.keyboard.press("Escape")

    # 6. Demo section centered
    page.evaluate("document.getElementById('demo').scrollIntoView()")
    page.wait_for_timeout(700)
    page.screenshot(path=f"{OUT}/v-demo-section.png")

    ctx.close()

    # 7. Mobile touch: native pill with globe
    ctx2 = browser.new_context(has_touch=True, is_mobile=True, viewport={"width": 390, "height": 844})
    page2 = ctx2.new_page()
    page2.goto(BASE + "/", wait_until="networkidle")
    page2.screenshot(path=f"{OUT}/v-hero-mobile-touch.png")
    ctx2.close()

    browser.close()
    print("page errors:", errors if errors else "none")
    print("ALL SCREENSHOTS DONE")
