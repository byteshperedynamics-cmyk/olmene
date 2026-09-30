#!/usr/bin/env python3
"""Site-wide text/overflow audit against the LIVE Marketwise site.

Checks every public route at 6 breakpoints (mobile/tablet/laptop/desktop):
  1. document-level horizontal overflow (scrollWidth > clientWidth)
  2. elements wider than the viewport
  3. tofu / replacement characters in visible text
  4. unintended text clipping (overflow hidden + scrollWidth > clientWidth)
Also audits interactive states: open mobile nav, expand methodology <details>.
"""
import json
import sys
from playwright.sync_api import sync_playwright

BASE = "https://get.marketwiselabs.workers.dev"
ROUTES = ["/", "/pricing/", "/sample-report/", "/login/", "/legal/terms", "/legal/privacy"]
SIZES = [(320, 700), (390, 844), (768, 1024), (1024, 768), (1280, 800), (1440, 900)]

AUDIT_JS = """
(() => {
  const vw = document.documentElement.clientWidth;
  const overflowX = document.documentElement.scrollWidth - vw;
  const bad = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width > vw + 1 || r.right > vw + 1) {
      const cls = (el.className && typeof el.className === "string")
        ? el.className.split(" ").slice(0, 3).join(".") : "";
      bad.push(`${el.tagName.toLowerCase()}${cls ? "." + cls : ""} w=${Math.round(r.width)} right=${Math.round(r.right)}`);
      if (bad.length >= 5) break;
    }
  }
  const tofu = (document.body.innerText.match(/[\uFFFD\u25A1\uF8FF]/g) || []).length;
  const clipped = [];
  for (const el of document.querySelectorAll("p, h1, h2, h3, h4, span, a, button, td, li, dt, dd")) {
    const cs = getComputedStyle(el);
    if ((cs.overflow === "hidden" || cs.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 2) {
      const cls = (typeof el.className === "string") ? el.className.split(" ").slice(0, 2).join(".") : "";
      clipped.push(`${el.tagName.toLowerCase()}${cls ? "." + cls : ""} "${el.textContent.trim().slice(0, 36)}"`);
      if (clipped.length >= 4) break;
    }
  }
  return { vw, overflowX, bad, tofu, clipped };
})()
"""


def audit(page, label):
    r = page.evaluate(AUDIT_JS)
    issues = []
    if r["overflowX"] > 1:
        issues.append(f"overflowX={r['overflowX']}")
    if r["bad"]:
        issues.append("wide: " + "; ".join(r["bad"][:3]))
    if r["tofu"]:
        issues.append(f"tofu={r['tofu']}")
    if r["clipped"]:
        issues.append("clipped: " + "; ".join(r["clipped"][:3]))
    status = "FAIL" if issues else "PASS"
    print(f"[{label}] {status}" + (" | " + " | ".join(issues) if issues else ""))
    return not issues


def main():
    all_ok = True
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for route in ROUTES:
            for (w, h) in SIZES:
                ctx = browser.new_context(viewport={"width": w, "height": h})
                page = ctx.new_page()
                page.goto(BASE + route, wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(1400)
                label = f"{w}x{h} {route}"
                ok = audit(page, label)
                all_ok = all_ok and ok

                # Interactive states on selected routes/sizes
                if route == "/" and w in (320, 390):
                    # open mobile nav sheet if present
                    try:
                        btn = page.locator("button[aria-label*='menu' i], button[aria-label*='Menu' i]").first
                        if btn.count():
                            btn.click(timeout=2000)
                            page.wait_for_timeout(700)
                            ok2 = audit(page, label + " +nav")
                            all_ok = all_ok and ok2
                            page.keyboard.press("Escape")
                    except Exception:
                        pass
                if route == "/" and w in (320, 390):
                    # run free diagnosis to result state, then audit result card
                    try:
                        page.goto(BASE + "/", wait_until="domcontentloaded")
                        inp = page.get_by_role("textbox", name="Your website URL")
                        inp.fill("example.org", timeout=4000)
                        page.get_by_role("button", name="Get my free diagnosis").click()
                        page.wait_for_selector("#diagnosis", timeout=40000)
                        page.wait_for_timeout(900)
                        ok3 = audit(page, label + " +result")
                        all_ok = all_ok and ok3
                        # expand methodology details
                        page.locator("#diagnosis summary").click()
                        page.wait_for_timeout(500)
                        ok4 = audit(page, label + " +methodology")
                        all_ok = all_ok and ok4
                    except Exception as e:
                        print(f"[{label} +result] SKIP ({type(e).__name__}: {e})")
                        all_ok = False
                if route == "/sample-report/" and w in (320, 390, 768):
                    # scroll to bottom to trigger lazy reveals, then audit
                    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    page.wait_for_timeout(900)
                    ok5 = audit(page, label + " +scrolled")
                    all_ok = all_ok and ok5
                ctx.close()
        browser.close()
    print("AUDIT_EXIT=" + ("0" if all_ok else "1"))
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
