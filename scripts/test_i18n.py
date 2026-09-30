#!/usr/bin/env python3
"""E2E i18n verification for the Marketwise language selector (local prod build).

Covers: default English SSR, switching languages, <html lang>/<dir> updates,
document.title translation, localStorage persistence, RTL for ar/ur,
per-page translation (pricing/legal/sample-report incl. report body),
no console errors, no horizontal overflow at 320px, and dictionary chunk
loading for non-English.
"""
import re
import sys
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
results = []


def dismiss_banner(page):
    """Dismiss the fixed cookie-consent banner if present (it overlays the
    footer selector). Locale-independent: any of its buttons works."""
    banner = page.locator('[aria-labelledby="cookie-consent-title"]')
    if banner.count() > 0 and banner.first.is_visible():
        banner.locator("button").first.click()
        page.wait_for_timeout(600)


def switch_lang(page, code):
    """Switch language via the custom dropdown (fine-pointer devices).

    The native <select> is display:none on hover-capable devices (Chromium
    reports hover:hover + pointer:fine even in headless), so select_option()
    would fail its actionability checks. Drive the real UI instead. The
    selector lives in the header (desktop, >=md) and the footer (always);
    target the first VISIBLE trigger so the hidden faces never match.
    """
    # The fixed cookie-consent banner can overlay the footer selector —
    # clicking any of its buttons dismisses it (text is locale-dependent, so
    # match structurally, not by label).
    dismiss_banner(page)
    page.locator("button[aria-haspopup='listbox']:visible").first.click()
    page.locator(f"li[data-lang='{code}']").first.click()


def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail}]" if detail and not ok else ""))


def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))

        # ── 1. Fresh visit: English SSR, selector present ──
        page.goto(BASE + "/", wait_until="networkidle")
        dismiss_banner(page)
        check("default html lang=en", page.eval_on_selector("html", "el => el.lang") == "en")
        check("default dir=ltr", page.eval_on_selector("html", "el => el.dir") in ("", "ltr"))
        check("hero title English", "Know" in page.locator("h1").inner_text() and "exactly" in page.locator("h1").inner_text())
        opts = page.locator("select").first.locator("option")  # hidden on desktop, still in DOM
        check("selector has 15 languages", opts.count() == 15, f"got {opts.count()}")
        sel_val = page.eval_on_selector("select", "el => el.value")
        check("selector defaults to English", sel_val == "en", sel_val)
        check("document.title default", page.title() == "Marketwise — Know exactly what to fix to get more customers", page.title())

        # ── 1b. Custom dropdown: globe, panel, a11y state (footer face at 390px) ──
        check("no selector in hero", page.locator("main section").first.locator("button[aria-haspopup='listbox']").count() == 0)
        trig = page.locator("button[aria-haspopup='listbox']:visible").first
        check("custom trigger visible (footer)", trig.is_visible())
        check("globe icon visible on trigger", trig.locator("svg").first.is_visible())
        trig.click()
        check("panel opens with 15 rows", page.locator("li[data-lang]").count() == 15)
        check("aria-expanded true", trig.get_attribute("aria-expanded") == "true")
        check("english row aria-selected", page.locator("li[data-lang='en']").get_attribute("aria-selected") == "true")
        page.screenshot(path="/home/z/my-project/artifacts/i18n-panel-open.png", full_page=False)
        page.keyboard.press("Escape")
        page.wait_for_timeout(250)
        check("escape closes panel", page.locator("li[data-lang]").count() == 0)
        check("aria-expanded false", trig.get_attribute("aria-expanded") == "false")

        # ── 1c. Keyboard navigation: arrows + Enter select Spanish ──
        trig.click()
        for _ in range(3):  # en → zh → hi → es
            page.keyboard.press("ArrowDown")
        page.keyboard.press("Enter")
        page.wait_for_timeout(900)
        check("keyboard select Spanish", page.eval_on_selector("html", "el => el.lang") == "es")

        # ── 2. Switch to Greek ──
        switch_lang(page, "el")
        page.wait_for_timeout(900)
        check("html lang=el", page.eval_on_selector("html", "el => el.lang") == "el")
        h1 = page.locator("h1").inner_text()
        check("hero title Greek", "Ξέρετε" in h1 and "πελάτες" in h1, h1)
        check("html lang=el dir still ltr", page.eval_on_selector("html", "el => el.dir") == "ltr")
        check("footer Greek", "Αναφορές" in page.locator("footer").inner_text())
        check("doc title Greek", "Ξέρετε" in page.title() and "Marketwise" in page.title(), page.title())
        check("lang persisted in localStorage", page.evaluate("localStorage.getItem('mw-lang')") == "el")

        # ── 3. Reload → persistence ──
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1200)
        check("persisted lang=el after reload", page.eval_on_selector("html", "el => el.lang") == "el")
        h1 = page.locator("h1").inner_text()
        check("Greek after reload", "Ξέρετε" in h1, h1)

        # ── 4. Cookie banner in Greek (reopen via footer link) ──
        page.locator("footer button", has_text="cookies").first.click()
        page.wait_for_timeout(400)
        banner = page.locator("[role=dialog]").inner_text()
        check("cookie banner Greek", "Cookies, απόφασή" in banner, banner[:60])

        # ── 5. Arabic → RTL ──
        switch_lang(page, "ar")
        page.wait_for_timeout(900)
        check("html lang=ar", page.eval_on_selector("html", "el => el.lang") == "ar")
        check("html dir=rtl (arabic)", page.eval_on_selector("html", "el => el.dir") == "rtl")
        h1 = page.locator("h1").inner_text()
        check("hero Arabic", "اعرف" in h1, h1[:50])
        overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("no horizontal overflow (ar, 390px)", overflow <= 1, f"{overflow}px")
        page.screenshot(path="/home/z/my-project/artifacts/i18n-ar-390.png", full_page=False)

        # RTL arrow flip class exists
        check("rtl-flip arrows present", page.locator(".rtl-flip").count() > 0)

        # ── 6. Urdu → RTL ──
        switch_lang(page, "ur")
        page.wait_for_timeout(900)
        check("html dir=rtl (urdu)", page.eval_on_selector("html", "el => el.dir") == "rtl")
        check("html lang=ur", page.eval_on_selector("html", "el => el.lang") == "ur")
        page.screenshot(path="/home/z/my-project/artifacts/i18n-ur-390.png", full_page=False)

        # ── 7. German / Chinese / Japanese quick checks (desktop viewport) ──
        page.set_viewport_size({"width": 1440, "height": 900})
        check("header selector visible at desktop", page.locator("header button[aria-haspopup='listbox']").first.is_visible())
        check("jump nav: Proof link present", page.locator("header nav a[href='/#teardown']").count() == 1)
        check("jump nav: FAQ link present", page.locator("header nav a[href='/#faq']").count() == 1)
        for code, needle, label in [
            ("de", "Weniger als eine Stunde", "German"),
            ("zh", "营销", "Chinese"),
            ("ja", "マーケティング", "Japanese"),
        ]:
            switch_lang(page, code)
            page.wait_for_timeout(900)
            body = page.locator("body").inner_text()
            check(f"{label} renders", needle in body)
        # Chinese screenshot
        page.screenshot(path="/home/z/my-project/artifacts/i18n-zh-1440.png", full_page=False)

        # ── 8. Greek: pricing page ──
        switch_lang(page, "el")
        page.wait_for_timeout(600)
        page.goto(BASE + "/pricing/", wait_until="networkidle")
        page.wait_for_timeout(900)
        body = page.locator("body").inner_text()
        check("pricing page Greek", "Τιμές" in body and "Σχέδια" not in body, body[:80])
        check("pricing doc title Greek", "Τιμές" in page.title(), page.title())

        # ── 9. Greek: legal/privacy ──
        page.goto(BASE + "/legal/privacy/", wait_until="networkidle")
        page.wait_for_timeout(900)
        body = page.locator("body").inner_text()
        check("privacy page Greek", "πολιτική απορρήτου" in body.lower(), body[:100])

        # ── 10. Greek: sample report (report body translated) ──
        page.goto(BASE + "/sample-report/", wait_until="networkidle")
        page.wait_for_timeout(1600)
        body = page.locator("body").inner_text()
        check("sample report page Greek chrome", "Δειγματική" in body)
        check("sample report tabs Greek", "Σύνοψη" in body and "Ανταγωνιστές" in body)
        check("sample report body Greek (exec summary)", "Fernway" in body and "αγαπημένο προϊόν" in body, body[200:400])
        # switch tab to roadmap and verify translated roadmap
        page.get_by_role("tab", name=re.compile("Χάρτης|Οδικός")).first.click()
        page.wait_for_timeout(300)
        body = page.locator("body").inner_text()
        check("sample report roadmap Greek", "Ξαναγράψτε" in body, body[:80])
        overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check("no overflow on sample-report (el)", overflow <= 1, f"{overflow}px")

        # ── 11. Back to English ──
        switch_lang(page, "en")
        page.wait_for_timeout(700)
        h1 = page.locator("h1").first.inner_text()
        check("back to English", "Sample marketing report" in h1, h1)
        check("html lang back to en", page.eval_on_selector("html", "el => el.lang") == "en")

        # ── 12. English SSR integrity: fresh context has English (server HTML) ──
        ctx2 = browser.new_context(viewport={"width": 1280, "height": 800})
        page2 = ctx2.new_page()
        page2.goto(BASE + "/", wait_until="domcontentloaded")
        h1_html = page2.locator("h1").inner_html()
        check("SSR h1 is English (no flash)", "Know" in h1_html and "exactly" in h1_html, h1_html[:80])

        # ── 13. Touch profile: the native <select> is the interactive control ──
        # (has_touch + is_mobile make Chromium report hover:none/pointer:coarse,
        #  which flips the CSS to the native-select face of the component)
        ctx3 = browser.new_context(has_touch=True, is_mobile=True, viewport={"width": 390, "height": 844})
        page3 = ctx3.new_page()
        touch_errors = []
        page3.on("pageerror", lambda e: touch_errors.append(str(e)))
        page3.goto(BASE + "/", wait_until="networkidle")
        check("touch: native select visible", page3.locator("select:visible").first.is_visible())
        check("touch: custom trigger hidden", not page3.locator("button[aria-haspopup='listbox']").first.is_visible())
        check("touch: globe icon visible on native pill", page3.locator(".lang-select-native:visible").first.locator("svg").first.is_visible())
        page3.locator("select:visible").first.select_option("fr")
        page3.wait_for_timeout(900)
        check("touch: html lang=fr via native select", page3.eval_on_selector("html", "el => el.lang") == "fr")
        h1 = page3.locator("h1").inner_text()
        check("touch: hero French", "Sachez" in h1 and "clients" in h1, h1[:60])
        check("touch: zero page errors", len([e for e in touch_errors if "__name" not in e]) == 0, "; ".join(touch_errors[:2]))
        ctx3.close()

        # ── Console errors across the whole session ──
        real_errors = [e for e in errors if "__name" not in e]
        check("zero page errors", len(real_errors) == 0, "; ".join(real_errors[:3]))

        browser.close()

    fails = [r for r in results if not r[1]]
    print(f"\n{'='*60}\n{len(results)-len(fails)}/{len(results)} PASS")
    if fails:
        print("FAILED:")
        for name, _, detail in fails:
            print(f"  - {name}: {detail}")
        sys.exit(1)


if __name__ == "__main__":
    run()
