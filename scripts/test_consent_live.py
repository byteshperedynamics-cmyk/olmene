#!/usr/bin/env python3
"""E2E test of the GA consent flow on localhost.

Covers:
 1. Fresh visitor → banner appears with Accept + Reject
 2. Accept → banner hides, gtag.js loads, GA collect beacon fires,
    consent=granted in dataLayer, choice stored
 3. Reload after accept → NO banner, gtag.js still loads (returning visitor)
 4. Fresh visitor → Reject → zero googletagmanager/google-analytics requests,
    choice stored, banner hides
 5. Reload after reject → NO banner, still zero Google requests
 6. Footer "Cookie preferences" → banner reopens; Accept again works
 7. No page errors / hydration warnings anywhere
"""
from playwright.sync_api import sync_playwright
import json

BASE = "https://get.marketwiselabs.workers.dev"
KEY = "mw-analytics-consent"
PASS, FAIL = [], []


def check(name, ok, extra=""):
    (PASS if ok else FAIL).append(name)
    print(("PASS " if ok else "FAIL ") + name + (f"  [{extra}]" if extra else ""))


def google_requests(reqs):
    return [r for r in reqs if "googletagmanager.com" in r or "google-analytics.com" in r]


with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------- 1+2: fresh visitor sees banner, accepts ----------
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)[:150]))
    reqs = []
    page.on("request", lambda r: reqs.append(r.url))
    page.goto(BASE + "/", wait_until="domcontentloaded")
    page.wait_for_timeout(1500)

    banner = page.locator("#cookie-consent-title")
    check("1a. banner appears for fresh visitor", banner.count() == 1 and banner.is_visible())
    check("1b. both buttons present",
          page.get_by_role("button", name="Accept", exact=True).count() == 1
          and page.get_by_role("button", name="Reject", exact=True).count() == 1)
    check("1c. no Google requests before choice", len(google_requests(reqs)) == 0,
          str(google_requests(reqs)[:2]))

    page.get_by_role("button", name="Accept", exact=True).click()
    page.wait_for_timeout(4000)  # gtag.js + collect beacon

    check("2a. banner hidden after accept", banner.count() == 0 or not banner.is_visible())
    gtag_loaded = any("googletagmanager.com/gtag/js" in r and "G-P6X5RFQG7W" in r for r in reqs)
    check("2b. gtag.js loaded with measurement ID", gtag_loaded)
    # GA4 migrated the collect endpoint to analytics.google.com (the legacy
    # google-analytics.com host still appears in some regions) — accept both.
    collect = [r for r in reqs if ("google-analytics.com/g/collect" in r or "analytics.google.com/g/collect" in r) and "G-P6X5RFQG7W" in r]
    check("2c. GA4 collect beacon fired", len(collect) >= 1, f"{len(collect)} beacons")
    consent_state = page.evaluate("""(() => {
      const dl = window.dataLayer || [];
      let granted = false, denied = false;
      for (const entry of dl) {
        if (entry && entry[0] === 'consent' && entry[1] === 'update') {
          if (entry[2] && entry[2].analytics_storage === 'granted') granted = true;
          if (entry[2] && entry[2].analytics_storage === 'denied') denied = true;
        }
      }
      return {granted, denied};
    })()""")
    check("2d. consent granted pushed", consent_state["granted"])
    stored = page.evaluate(f"localStorage.getItem('{KEY}')")
    check("2e. choice stored as accepted", stored == "accepted")
    ga_cookies = [c["name"] for c in ctx.cookies() if c["name"].startswith("_ga")]
    check("2f. _ga cookie set", len(ga_cookies) >= 1, str(ga_cookies))

    # ---------- 3: reload after accept ----------
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    check("3a. no banner on reload (accepted)", banner.count() == 0 or not banner.is_visible())
    re_reqs = []
    page.on("request", lambda r: re_reqs.append(r.url))
    page.evaluate("location.reload()")
    page.wait_for_timeout(3000)
    check("3b. gtag.js loads on return visit",
          any("googletagmanager.com/gtag/js" in r for r in re_reqs))
    check("3c. consent granted on load (returning visitor)",
          page.evaluate("""(() => { const dl=window.dataLayer||[];
            return dl.some(e=>e&&e[0]==='consent'&&e[1]==='update'&&e[2]&&e[2].analytics_storage==='granted'); })()"""))
    check("3d. no page errors (accept flow)", len(errors) == 0, str(errors[:2]))
    ctx.close()

    # ---------- 4+5: fresh visitor rejects ----------
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    page = ctx.new_page()
    banner = page.locator("#cookie-consent-title")  # rebind to new page
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)[:150]))
    reqs = []
    page.on("request", lambda r: reqs.append(r.url))
    page.goto(BASE + "/", wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    check("4a. banner appears for second fresh visitor", banner.count() == 1 and banner.is_visible())
    page.get_by_role("button", name="Reject", exact=True).click()
    page.wait_for_timeout(2500)
    check("4b. banner hidden after reject", banner.count() == 0 or not banner.is_visible())
    check("4c. ZERO Google requests after reject", len(google_requests(reqs)) == 0,
          str(google_requests(reqs)[:3]))
    check("4d. choice stored as rejected", page.evaluate(f"localStorage.getItem('{KEY}')") == "rejected")
    check("4e. no _ga cookies", not any(c["name"].startswith("_ga") for c in ctx.cookies()))
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    re_reqs = [r.url for r in []] # placeholder
    check("5a. no banner on reload (rejected)", banner.count() == 0 or not banner.is_visible())
    check("5b. still ZERO Google requests (rejected return)",
          len(google_requests(reqs)) == 0)
    check("5c. no page errors (reject flow)", len(errors) == 0, str(errors[:2]))

    # ---------- 6: footer Cookie preferences reopens banner ----------
    page.get_by_role("button", name="Cookie preferences").click()
    page.wait_for_timeout(600)
    banner = page.locator("#cookie-consent-title")
    check("6a. banner reopens from footer", banner.count() == 1 and banner.is_visible())
    page.get_by_role("button", name="Accept", exact=True).click()
    page.wait_for_timeout(3500)
    new_google = [r for r in reqs if "googletagmanager.com/gtag/js" in r]
    # reqs listener persists across reloads on same page? no — track via evaluate
    check("6b. accepted again → gtag present in DOM",
          page.evaluate("!!document.querySelector('script[src*=googletagmanager]')"))
    check("6c. stored accepted again", page.evaluate(f"localStorage.getItem('{KEY}')") == "accepted")

    # ---------- 7: banner layout at 320px ----------
    page.set_viewport_size({"width": 320, "height": 700})
    page.evaluate("localStorage.clear()")
    page.goto(BASE + "/", wait_until="domcontentloaded")
    page.wait_for_timeout(1200)
    overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check("7a. no horizontal overflow at 320px with banner", overflow <= 0, f"{overflow}px")
    shot_ok = True
    page.screenshot(path="/home/z/my-project/shots/verify/cookie_banner_320.png")
    ctx.close()
    browser.close()

print(f"\n=== {len(PASS)} passed, {len(FAIL)} failed ===")
if FAIL:
    print("FAILURES:", FAIL)
    raise SystemExit(1)
