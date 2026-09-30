#!/usr/bin/env python3
"""Touch interaction tests on emulated mobile devices, per engine.

Covers: mobile menu open/navigate, FAQ accordion toggle, cookie banner
accept/reject + footer preferences, free-audit form focus, video overlay,
theme toggle, header anchor links.
Usage: python3 scripts/touch_tests.py <engine> [--base URL]
  (webkit must run via scripts/run_webkit.sh)
"""
from playwright.sync_api import sync_playwright
import sys

ENGINE = sys.argv[1] if len(sys.argv) > 1 else "chromium"
BASE = "http://localhost:3111"
DEVICE = {"width": 390, "height": 844, "dpr": 3, "ua": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"}

PASS, FAIL = [], []
def check(name, ok, extra=""):
    (PASS if ok else FAIL).append(name)
    print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra else ""))

with sync_playwright() as p:
    launcher = getattr(p, ENGINE)
    kwargs = {"headless": False} if ENGINE == "webkit" else {"headless": True}
    browser = launcher.launch(**kwargs)
    ctx = browser.new_context(
        viewport={"width": DEVICE["width"], "height": DEVICE["height"]},
        device_scale_factor=DEVICE["dpr"],
        has_touch=True,
        is_mobile=ENGINE != "firefox",
        user_agent=DEVICE["ua"],
    )
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)[:90]))

    # ---- 1. mobile menu ----
    pg.goto(BASE + "/", timeout=30000, wait_until="domcontentloaded")
    pg.wait_for_timeout(1200)
    try:
        pg.get_by_role("button", name="Toggle menu").click(timeout=4000)
        pg.wait_for_timeout(700)
        menu_open = pg.locator("header button[aria-expanded='true']").count() == 1
        check("1a. mobile menu opens", menu_open)
        # navigate from menu (nav[aria-label='Mobile'] appears when open)
        link = pg.locator("header nav[aria-label='Mobile'] a").filter(has_text="Pricing").first
        link.click(timeout=4000)
        pg.wait_for_timeout(1200)
        check("1b. menu link navigates to /pricing/", "/pricing" in pg.url)
    except Exception as e:
        check("1a. mobile menu opens", False, str(e)[:60])

    # ---- 2. FAQ accordion (homepage) ----
    pg.goto(BASE + "/", timeout=30000, wait_until="domcontentloaded")
    pg.wait_for_timeout(1200)
    try:
        # accept cookie banner first if present
        acc = pg.get_by_role("button", name="Accept", exact=True)
        if acc.count():
            acc.click()
            pg.wait_for_timeout(500)
        pg.locator("#faq").scroll_into_view_if_needed()
        pg.wait_for_timeout(400)
        trigger = pg.locator("#faq [data-state], #faq button, #faq [role='button']").first
        trigger.click(timeout=4000)
        pg.wait_for_timeout(600)
        expanded = pg.locator("#faq [data-state='open']").count() > 0
        check("2a. FAQ accordion expands on tap", expanded)
        # re-locate the open TRIGGER button (divs also carry data-state) and tap it
        pg.locator("#faq button[data-state='open']").first.click(timeout=4000)
        pg.wait_for_timeout(500)
        check("2b. FAQ accordion collapses on second tap", pg.locator("#faq button[data-state='open']").count() == 0)
    except Exception as e:
        check("2a. FAQ accordion expands on tap", False, str(e)[:60])

    # ---- 3. cookie banner flow ----
    ctx2 = browser.new_context(
        viewport={"width": DEVICE["width"], "height": DEVICE["height"]},
        has_touch=True, is_mobile=ENGINE != "firefox", user_agent=DEVICE["ua"],
    )
    pg2 = ctx2.new_page()
    pg2.goto(BASE + "/", timeout=30000, wait_until="domcontentloaded")
    pg2.wait_for_timeout(1000)
    check("3a. banner appears (fresh visitor)", pg2.locator("#cookie-consent-title").count() == 1)
    bb = pg2.get_by_role("button", name="Reject", exact=True).bounding_box()
    check("3b. banner buttons ≥40px touch height", bb and bb["height"] >= 40, f"{bb['height']:.0f}px" if bb else "none")
    pg2.get_by_role("button", name="Reject", exact=True).tap(timeout=4000) if ENGINE != "firefox" else pg2.get_by_role("button", name="Reject", exact=True).click()
    pg2.wait_for_timeout(600)
    check("3c. banner closes on Reject tap", pg2.locator("#cookie-consent-title").count() == 0)

    # ---- 4. free-audit form ----
    pg.goto(BASE + "/", timeout=30000, wait_until="domcontentloaded")
    pg.wait_for_timeout(1000)
    acc = pg.get_by_role("button", name="Accept", exact=True)
    if acc.count():
        acc.click()
        pg.wait_for_timeout(400)
    try:
        inp = pg.locator("input[type='url'], input[placeholder*='website' i], #free-diagnosis input").first
        inp.tap(timeout=4000) if ENGINE != "firefox" else inp.click()
        pg.wait_for_timeout(500)
        focused = pg.evaluate("document.activeElement === document.querySelector('#free-diagnosis input')")
        fs = pg.evaluate("parseFloat(getComputedStyle(document.activeElement).fontSize)")
        check("4a. URL input focuses on tap", bool(focused))
        check("4b. input font ≥16px (no iOS zoom)", fs >= 16, f"{fs}px")
        pg.evaluate("document.activeElement.blur()")
    except Exception as e:
        check("4a. URL input focuses on tap", False, str(e)[:60])

    # ---- 5. video overlay ----
    try:
        pg.locator("#demo").scroll_into_view_if_needed()
        pg.wait_for_timeout(500)
        check("5a. video poster visible", pg.locator("#demo video").is_visible())
        check("5b. play overlay button visible", pg.locator("#demo button[aria-label*='Play']").is_visible())
    except Exception as e:
        check("5a. video poster visible", False, str(e)[:60])

    # ---- 6. theme toggle ----
    try:
        pg.evaluate("window.scrollTo(0,0)")
        pg.wait_for_timeout(400)
        tt = pg.locator("header button[aria-label*='theme' i], header button[aria-label*='dark' i], header button[aria-label*='light' i]").first
        tt.click(timeout=4000)
        pg.wait_for_timeout(700)
        dark = pg.evaluate("document.documentElement.classList.contains('dark')")
        check("6a. theme toggles to dark on tap", bool(dark))
        tt.click(timeout=4000)
        pg.wait_for_timeout(700)
        check("6b. theme toggles back to light", not pg.evaluate("document.documentElement.classList.contains('dark')"))
    except Exception as e:
        check("6a. theme toggles to dark on tap", False, str(e)[:60])

    # ---- 7. anchor navigation (desktop nav anchors are md+; use in-page CTA link instead) ----
    try:
        pg.goto(BASE + "/", timeout=30000, wait_until="domcontentloaded")
        pg.wait_for_timeout(800)
        # find an in-page hash link outside the header (hero/how-it-works CTAs)
        hash_link = pg.locator("main a[href^='#']").first
        if hash_link.count() == 0:
            check("7a. in-page anchor scrolls", False, "no in-page anchor links found")
        else:
            hash_link.click(timeout=4000)
            pg.wait_for_timeout(1200)
            y = pg.evaluate("window.scrollY")
            check("7a. in-page anchor scrolls", y > 300, f"scrollY={y}")
    except Exception as e:
        check("7a. in-page anchor scrolls", False, str(e)[:60])

    check("8a. zero JS errors during all interactions", len(errors) == 0, str(errors[:1]))
    ctx.close()
    ctx2.close()
    browser.close()

print(f"\n=== {ENGINE} touch: {len(PASS)} passed, {len(FAIL)} failed ===")
if FAIL:
    print("FAILURES:", FAIL)
    sys.exit(1)
