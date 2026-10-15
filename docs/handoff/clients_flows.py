"""Click through the Clients page on /dev/clients/ (its API answered in memory by fake-api.ts).

Checks every action an agency takes: add, edit, remove a client; give and move
sites; create, copy and turn off a client page; branding (validation, save,
white label, logo upload and refusal); viewer and company states.

Usage: python3 -I clients_flows.py <out_dir> <jpeg> [light|dark] [width]
"""
import os
import re
import sys

from playwright.sync_api import expect, sync_playwright

OUT, IMG = sys.argv[1], sys.argv[2]
SCHEME = sys.argv[3] if len(sys.argv) > 3 else "light"
W = int(sys.argv[4]) if len(sys.argv) > 4 else 1280
BASE = "http://localhost:3000"
os.makedirs(OUT, exist_ok=True)
log = []


def ok(msg):
    log.append(f"ok   {msg}")


def shot(page, name):
    page.screenshot(path=f"{OUT}/{name}.{SCHEME}-{W}.png", full_page=False)


def toast(page, text):
    expect(page.locator("[data-sonner-toast]").filter(has_text=text).first).to_be_visible(timeout=5000)


def site_in(c, host):
    return c.locator("ul li").get_by_role("link", name=host, exact=True)


def card(page, name):
    return page.locator("article").filter(has=page.get_by_role("heading", name=name, exact=True))


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": W, "height": 900}, color_scheme=SCHEME, device_scale_factor=1)
    ctx.grant_permissions(["clipboard-read", "clipboard-write"])
    # Keep the cookie banner out of the way.
    ctx.add_init_script("try { localStorage.setItem('mw-analytics-consent', 'rejected') } catch {}")
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" and "DevTools" not in m.text else None)

    page.goto(BASE + "/dev/clients/", wait_until="domcontentloaded")
    expect(page.get_by_role("heading", name="3 clients")).to_be_visible(timeout=60_000)
    ok("page loads with 3 clients")

    # ── Add a client (refused, then accepted) ─────────────────────────────
    page.get_by_role("button", name="Add client").click()
    form = page.locator("form").filter(has=page.get_by_text("Client name"))
    form.get_by_label("Client name").fill("Greenleaf Yoga")
    form.get_by_label("Website (optional)").fill("not a website")
    form.get_by_role("button", name="Add client").click()
    expect(page.get_by_role("alert").filter(has_text="website address")).to_be_visible()
    expect(form.get_by_label("Website (optional)")).to_have_attribute("aria-invalid", "true")
    ok("a bad website is refused, field marked")
    form.get_by_label("Website (optional)").fill("greenleaf-yoga.example")
    form.get_by_label("Contact email (optional)").fill("Hello@Greenleaf-Yoga.example")
    shot(page, "add-client")
    form.get_by_role("button", name="Add client").click()
    toast(page, "Greenleaf Yoga added")
    expect(page.get_by_role("heading", name="4 clients")).to_be_visible()
    g = card(page, "Greenleaf Yoga")
    expect(g.get_by_text("hello@greenleaf-yoga.example")).to_be_visible()
    ok("client added; email lower-cased; list sorted in")

    # ── Give an unassigned site to it ──────────────────────────────────────
    page.get_by_label("Give greenleaf-yoga.example to a client").select_option(label="Greenleaf Yoga")
    toast(page, "greenleaf-yoga.example now belongs to Greenleaf Yoga")
    expect(site_in(g, "greenleaf-yoga.example")).to_be_visible()
    expect(page.get_by_label("Give greenleaf-yoga.example to a client")).to_have_count(0)
    ok("unassigned site given to the client")

    # ── Move a site between clients, then back to no client ───────────────
    page.get_by_label("Move shop.bakerybrothers.example to another client").select_option(label="To Harbor Dental")
    toast(page, "shop.bakerybrothers.example now belongs to Harbor Dental")
    expect(site_in(card(page, "Harbor Dental"), "shop.bakerybrothers.example")).to_be_visible()
    expect(card(page, "Bakery Brothers").get_by_text("1 site", exact=True)).to_be_visible()
    page.get_by_label("Move shop.bakerybrothers.example to another client").select_option(label="No client")
    toast(page, "no longer belongs to Harbor Dental")
    expect(page.get_by_label("Give shop.bakerybrothers.example to a client")).to_be_visible()
    ok("site moved between clients and back to none")

    # ── Add a site from inside a card ──────────────────────────────────────
    card(page, "Atlas Logistics").get_by_label("Add a site to Atlas Logistics").select_option(label="citymotors.example")
    toast(page, "citymotors.example now belongs to Atlas Logistics")
    ok("site added from the client's card")

    # ── Client page link: create, copy, turn off ──────────────────────────
    g.get_by_role("button", name="Create link").click()
    toast(page, "page is ready")
    link = g.get_by_label("Link to Greenleaf Yoga's page")
    expect(link).to_have_value(re.compile(r"^http://localhost:3000/c/[a-z2-9]{12}/$"))
    url = link.input_value()
    g.get_by_role("button", name="Copy").click()
    expect(g.get_by_role("button", name="Copied")).to_be_visible()
    clip = page.evaluate("navigator.clipboard.readText()")
    assert clip == url, (clip, url)
    expect(g.get_by_text("On · not opened yet")).to_be_visible()
    shot(page, "client-page-on")
    ok(f"client page created ({url.split('/c/')[1]}) and copied")
    g.get_by_role("button", name="Turn off").click()
    dlg = page.get_by_role("alertdialog")
    expect(dlg).to_contain_text("new address")
    shot(page, "turn-off-dialog")
    dlg.get_by_role("button", name="Turn off").click()
    toast(page, "The link no longer opens")
    expect(g.get_by_role("button", name="Create link")).to_be_visible()
    ok("client page turned off after confirming")

    # ── Edit a client ─────────────────────────────────────────────────────
    g.get_by_role("button", name="Edit").click()
    ef = card(page, "Edit Greenleaf Yoga").locator("form")
    ef.get_by_label("Client name").fill("Greenleaf Yoga Studio")
    ef.get_by_label("Contact email (optional)").fill("")
    ef.get_by_role("button", name="Save").click()
    toast(page, "Client saved")
    g2 = card(page, "Greenleaf Yoga Studio")
    expect(g2).to_be_visible()
    expect(g2.get_by_text("hello@greenleaf-yoga.example")).to_have_count(0)
    ok("client renamed, contact cleared")

    # ── Remove a client: its sites stay ────────────────────────────────────
    card(page, "Atlas Logistics").get_by_role("button", name="Remove Atlas Logistics").click()
    dlg = page.get_by_role("alertdialog")
    expect(dlg).to_contain_text("site stays")
    dlg.get_by_role("button", name="Remove client").click()
    toast(page, "Atlas Logistics removed")
    expect(page.get_by_label("Give citymotors.example to a client")).to_be_visible()
    ok("client removed; its site back without a client")

    # ── Branding ───────────────────────────────────────────────────────────
    br = page.locator("#branding")
    br.scroll_into_view_if_needed()
    save = br.get_by_role("button", name="Save branding")
    expect(save).to_be_disabled()
    br.get_by_label("Accent colour", exact=True).fill("#12zz45")
    expect(br.get_by_text("Use a colour like #1f6feb.")).to_be_visible()
    expect(save).to_be_disabled()
    ok("bad colour flagged, save disabled")
    br.get_by_label("Accent colour", exact=True).fill("#E8590C")
    br.get_by_label("Agency name").fill("Northwind  Digital ")
    br.get_by_label("Your website").fill("http://northwind.example")
    expect(br.get_by_text("Use your website's https address.")).to_be_visible()
    br.get_by_label("Your website").fill("northwind.example/hello")
    expect(br.locator("figure")).to_contain_text("Prepared by Northwind Digital")
    ok("preview follows the form")
    br.get_by_role("switch").click()
    shot(page, "branding-dirty")
    save.click()
    toast(page, "Branding saved")
    expect(save).to_be_disabled()
    expect(br.get_by_label("Agency name")).to_have_value("Northwind Digital")
    expect(br.get_by_label("Accent colour", exact=True)).to_have_value("#e8590c")
    expect(br.get_by_label("Your website")).to_have_value("https://northwind.example/hello")
    expect(br.get_by_role("switch")).to_have_attribute("data-state", "checked")
    expect(br.locator("figure")).not_to_contain_text("Measured with Olmene")
    ok("branding saved and cleaned (spaces, case, https); white label on")

    # Logo: an SVG is refused before upload, a JPEG goes up
    svg = os.path.join(OUT, "logo.svg")
    with open(svg, "w") as f:
        f.write('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    br.locator("input[type=file]").set_input_files(svg)
    expect(br.get_by_role("alert").filter(has_text="SVG isn't accepted")).to_be_visible()
    ok("SVG logo refused in the browser")
    br.locator("input[type=file]").set_input_files(IMG)
    toast(page, "Logo saved")
    expect(br.get_by_role("img", name="Your logo")).to_be_visible()
    expect(br.locator("figure img")).to_have_count(1)
    shot(page, "branding-logo")
    ok("JPEG logo uploaded and shown in the preview")
    br.get_by_role("button", name="Remove", exact=True).click()
    toast(page, "Logo removed")
    expect(br.get_by_text("No logo yet")).to_be_visible()
    ok("logo removed")

    # ── Viewer: nothing to change ─────────────────────────────────────────
    page.goto(BASE + "/dev/clients/?role=viewer", wait_until="domcontentloaded")
    expect(page.get_by_role("heading", name="3 clients")).to_be_visible(timeout=60_000)
    assert page.get_by_role("button", name="Add client").count() == 0
    assert page.get_by_role("button", name="Edit").count() == 0
    assert page.get_by_role("combobox").count() == 0
    assert page.get_by_role("button", name="Create link").count() == 0
    assert page.get_by_role("button", name="Save branding").count() == 0
    expect(page.get_by_role("button", name="Copy")).to_be_visible()
    ok("viewer: read-only, can still copy the link")

    # ── Member: manages clients, not branding or removal ───────────────────
    page.goto(BASE + "/dev/clients/?role=member", wait_until="domcontentloaded")
    expect(page.get_by_role("heading", name="3 clients")).to_be_visible(timeout=60_000)
    expect(page.get_by_role("button", name="Add client")).to_be_visible()
    assert page.get_by_role("button", name=re.compile("^Remove ")).count() == 0
    assert page.get_by_role("button", name="Save branding").count() == 0
    ok("member: manages clients; no removal or branding")

    # ── Company workspace: turn on agency features ─────────────────────────
    page.goto(BASE + "/dev/clients/?state=company", wait_until="domcontentloaded")
    page.get_by_role("button", name="Turn on agency features").click()
    toast(page, "Agency features are on")
    expect(page.get_by_role("heading", name="No clients yet")).to_be_visible()
    ok("company → agency from the Clients page")

    # ── Fix plan: white label isn't offered ────────────────────────────────
    page.goto(BASE + "/dev/clients/?plan=fix&role=owner", wait_until="domcontentloaded")
    br = page.locator("#branding")
    expect(br.get_by_text("Comes with the Team plan.")).to_be_visible(timeout=60_000)
    expect(br.get_by_role("switch")).to_be_disabled()
    expect(br.get_by_role("link", name="See plans")).to_be_visible()
    ok("white label needs the Team plan; owner sees the way to plans")

    b.close()

print("\n".join(log))
real = [e for e in errs if "favicon" not in e]
print("\n".join(real) if real else "no page errors")
