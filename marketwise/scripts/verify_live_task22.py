#!/usr/bin/env python3
"""Live spot-check of the polished language selector + centered demo section."""
from playwright.sync_api import sync_playwright

BASE = "https://get.marketwiselabs.workers.dev"
OUT = "/home/z/my-project/scratch"

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1. Default English + globe visible
    page.goto(BASE + "/", wait_until="networkidle")
    trig = page.locator("button[aria-haspopup='listbox']").first
    assert trig.is_visible(), "trigger not visible"
    assert trig.locator("svg").first.is_visible(), "globe not visible"
    print("PASS live: custom trigger + globe visible")

    # 2. Panel opens, 15 rows, centered, topmost
    trig.click()
    page.wait_for_timeout(400)
    rows = page.locator("li[data-lang]")
    assert rows.count() == 15, f"rows: {rows.count()}"
    box = page.locator(".lang-panel").bounding_box()
    assert box and 0 <= box["x"] and box["x"] + box["width"] <= 1440, f"box {box}"
    probe = page.evaluate(
        """() => {
        const r = document.querySelector('.lang-panel').getBoundingClientRect();
        const el = document.elementFromPoint(r.x + r.width/2, r.y + 20);
        return !!(el && el.closest('.lang-panel'));
    }"""
    )
    assert probe, "panel not topmost"
    print("PASS live: panel opens, 15 rows, in-viewport, topmost")
    page.screenshot(path=f"{OUT}/live-panel.png")

    # 3. Keyboard: Escape close, arrows + Enter -> Spanish
    page.keyboard.press("Escape")
    page.wait_for_timeout(250)
    assert page.locator("li[data-lang]").count() == 0, "escape did not close"
    trig.click()
    for _ in range(3):
        page.keyboard.press("ArrowDown")
    page.keyboard.press("Enter")
    page.wait_for_timeout(1200)
    assert page.eval_on_selector("html", "el => el.lang") == "es", "keyboard select failed"
    print("PASS live: keyboard nav (Escape, arrows, Enter) -> Spanish")

    # 4. Greek via click + hero Greek
    page.evaluate("localStorage.setItem('mw-lang','en')")  # reset first
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(600)
    trig = page.locator("button[aria-haspopup='listbox']").first
    trig.click()
    page.locator("li[data-lang='el']").first.click()
    page.wait_for_timeout(1200)
    assert page.eval_on_selector("html", "el => el.lang") == "el"
    h1 = page.locator("h1").inner_text()
    assert "Ξέρετε" in h1, h1[:50]
    print("PASS live: Greek switch via dropdown, hero translated")

    # 5. RTL Arabic: panel + trigger work, no overflow
    page.evaluate("localStorage.setItem('mw-lang','ar')")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1200)
    assert page.eval_on_selector("html", "el => el.dir") == "rtl"
    trig = page.locator("button[aria-haspopup='listbox']").first
    trig.click()
    page.wait_for_timeout(400)
    assert page.locator("li[data-lang]").count() == 15
    box = page.locator(".lang-panel").bounding_box()
    assert box and 0 <= box["x"] and box["x"] + box["width"] <= 1440, f"rtl box {box}"
    page.keyboard.press("Escape")
    ov = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    assert ov <= 1, f"overflow {ov}px"
    print("PASS live: Arabic RTL — panel works, no overflow")
    page.screenshot(path=f"{OUT}/live-ar-rtl.png")

    # 6. Demo section centered (back to English)
    page.evaluate("localStorage.setItem('mw-lang','en')")
    page.reload(wait_until="networkidle")
    page.evaluate("document.getElementById('demo').scrollIntoView()")
    page.wait_for_timeout(700)
    res = page.evaluate(
        """() => {
        const sec = document.getElementById('demo');
        const c = el => { const r = el.getBoundingClientRect(); return Math.round(r.x + r.width/2); };
        return { label: c(sec.querySelector('.section-label')), h2: c(sec.querySelector('h2')),
                 video: c(sec.querySelector('video')), vw: innerWidth };
    }"""
    )
    assert abs(res["label"] - res["video"]) <= 2 and abs(res["h2"] - res["video"]) <= 2, res
    print("PASS live: demo header centered above video", res)
    page.screenshot(path=f"{OUT}/live-demo.png")

    # 7. Footer selector (up variant) on pricing page
    page.goto(BASE + "/pricing/", wait_until="networkidle")
    banner = page.locator('[aria-labelledby="cookie-consent-title"]')
    if banner.count() > 0 and banner.first.is_visible():
        banner.locator("button").first.click()
        page.wait_for_timeout(300)
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(600)
    page.locator("footer button[aria-haspopup='listbox']").first.click()
    page.wait_for_timeout(400)
    box = page.locator(".lang-panel").bounding_box()
    assert box and box["y"] >= 0, f"footer panel {box}"
    print("PASS live: footer panel opens upward, within viewport")

    real_errors = [e for e in errors if "__name" not in e]
    assert not real_errors, real_errors
    print("PASS live: zero page errors")
    ctx.close()
    browser.close()
    print("\nALL LIVE SPOT-CHECKS PASSED")
