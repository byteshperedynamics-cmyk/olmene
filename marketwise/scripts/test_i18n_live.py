#!/usr/bin/env python3
"""Live i18n spot-check against production (get.marketwiselabs.workers.dev)."""
from playwright.sync_api import sync_playwright

BASE = "https://get.marketwiselabs.workers.dev"
results = []


def check(name, ok, detail=""):
    results.append((name, ok))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail}]" if detail and not ok else ""))


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    chunk_reqs = []
    page.on("response", lambda r: chunk_reqs.append(r.url) if ("/dictionaries/" in r.url or "sample-report" in r.url and r.url.endswith(".json")) else None)

    page.goto(BASE + "/", wait_until="networkidle")
    check("prod default English", "Know" in page.locator("h1").inner_text())
    check("prod selector present (15 langs)", page.locator("select").first.locator("option").count() == 15)

    page.locator("select").first.select_option("el")
    page.wait_for_timeout(2500)
    check("prod Greek hero", "Ξέρετε" in page.locator("h1").inner_text())
    check("prod html lang=el", page.eval_on_selector("html", "e => e.lang") == "el")
    check("prod Greek doc title", "Ξέρετε" in page.title(), page.title())
    check("prod Greek dict chunk fetched", any("dictionaries" in u for u in chunk_reqs))

    page.locator("select").first.select_option("ar")
    page.wait_for_timeout(2500)
    check("prod Arabic dir=rtl", page.eval_on_selector("html", "e => e.dir") == "rtl")
    overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check("prod Arabic no overflow (390px)", overflow <= 1, f"{overflow}px")
    page.screenshot(path="/home/z/my-project/artifacts/prod-ar-390.png")

    # sample report in Greek on prod (lazy sr chunk)
    page.locator("select").first.select_option("el")
    page.wait_for_timeout(1500)
    page.goto(BASE + "/sample-report/", wait_until="networkidle")
    page.wait_for_timeout(3000)
    body = page.locator("body").inner_text()
    check("prod sample-report Greek tabs", "Σύνοψη" in body)
    check("prod sample-report Greek body", "Fernway" in body and "αγαπημένο προϊόν" in body, body[150:300])
    check("prod sr chunk fetched", any("sample-report" in u for u in chunk_reqs))

    # login page Greek
    page.goto(BASE + "/login/", wait_until="networkidle")
    page.wait_for_timeout(1500)
    body = page.locator("body").inner_text()
    check("prod login Greek", "Σύνδεση" in body, body[:80])

    real_errors = [e for e in errors if "__name" not in e]
    check("prod zero page errors", len(real_errors) == 0, "; ".join(real_errors[:3]))
    b.close()

fails = [r for r in results if not r[1]]
print(f"\n{len(results)-len(fails)}/{len(results)} PASS")
exit(1 if fails else 0)
