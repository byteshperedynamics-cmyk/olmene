// Engine v2: Webflow and WordPress channels against fake APIs.
import { describe, expect, test } from "bun:test";
import { matchWebflowSite, planWebflow, webflowHomePage, webflowPageBody, writeWebflow } from "../channels/webflow";
import { mediaBaseName, planWordpress, verifyWordpress, writeWordpress } from "../channels/wordpress";
import { runAutoChanges, type SiteConnection } from "../channels";
import type { GuidedFix } from "../guided/build";

type Call = { url: string; method: string; body: unknown; auth: string | null };
function fakeFetch(routes: Array<[RegExp, (c: Call) => Response]>) {
  const calls: Call[] = [];
  const fn = async (input: string, init?: RequestInit) => {
    const c: Call = { url: input, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null, auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? null };
    calls.push(c);
    const hit = routes.find(([re]) => re.test(`${c.method} ${input}`));
    return hit ? hit[1](c) : new Response("{}", { status: 404 });
  };
  return { fn, calls };
}
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });

describe("Webflow", () => {
  const site = { id: "site1", shortName: "acme", customDomains: [{ id: "dom1", url: "www.acme.com" }] };
  const page = { id: "page1", slug: "", parentId: null, collectionId: null, seo: { title: "Home", description: "" }, openGraph: { title: "", titleCopied: true, description: "", descriptionCopied: true } };

  test("finds the site by custom domain and the static homepage", () => {
    expect(matchWebflowSite([site], "https://acme.com/")?.id).toBe("site1");
    expect(matchWebflowSite([{ id: "s2", shortName: "demo" }], "https://demo.webflow.io")?.id).toBe("s2");
    expect(matchWebflowSite([site], "https://other.com")).toBeNull();
    expect(webflowHomePage([{ id: "x", slug: "about" }, { ...page, collectionId: "c" }, page])?.id).toBe("page1");
  });

  test("plans SEO and Open Graph changes with the values they replace", () => {
    const plans = planWebflow(["title-tag", "meta-description", "social-meta"], site, page, { title: "Acme — analytics for teams", metaDescription: "Acme gives small teams analytics in a day." });
    expect(plans.get("title-tag")!.changes[0]).toMatchObject({ field: "seo.title", before: "Home", after: "Acme — analytics for teams" });
    expect(plans.get("social-meta")!.changes[0]).toMatchObject({ field: "openGraph.title", before: null });
    expect(webflowPageBody([{ field: "seo.title", value: "A" }, { field: "openGraph.title", value: null }])).toEqual({ seo: { title: "A" }, openGraph: { title: "", titleCopied: true } });
  });

  test("apply writes the page once, publishes, and undo writes the old values back", async () => {
    const { fn, calls } = fakeFetch([[/PUT .*\/pages\/page1$/, () => json({ id: "page1" })], [/POST .*\/sites\/site1\/publish$/, () => json({ queued: true })]]);
    const plans = [...planWebflow(["title-tag", "meta-description"], site, page, { title: "Acme — analytics for teams", metaDescription: "Acme gives small teams analytics in a day." }).values()];
    const r = await writeWebflow(fn, "tok", plans, "apply");
    expect(r).toEqual({ ok: true, published: true });
    expect(calls[0].body).toEqual({ seo: { title: "Acme — analytics for teams", description: "Acme gives small teams analytics in a day." } });
    expect(calls[0].auth).toBe("Bearer tok");
    expect(calls[1].body).toEqual({ customDomains: ["dom1"], publishToWebflowSubdomain: false });
    await writeWebflow(fn, "tok", plans, "revert");
    expect(calls[2].body).toEqual({ seo: { title: "Home", description: "" } });
  });

  test("a failed publish keeps the saved change and says so", async () => {
    const { fn } = fakeFetch([[/PUT /, () => json({})], [/publish/, () => json({ message: "Too many requests" }, 429)]]);
    const r = await writeWebflow(fn, "tok", [...planWebflow(["title-tag"], site, page, { title: "Acme — analytics for teams" }).values()], "apply");
    expect(r.ok).toBe(true);
    expect(r.published).toBe(false);
    expect(r.error).toContain("Publish from the Designer");
  });

  test("runAutoChanges marks applied cards and then reverted ones", async () => {
    const { fn } = fakeFetch([[/PUT /, () => json({})], [/publish/, () => json({})]]);
    const auto = planWebflow(["title-tag"], site, page, { title: "Acme — analytics for teams" }).get("title-tag")!;
    const fixes: GuidedFix[] = [{ id: "title-tag", title: "Page title", why: "", values: [], steps: [], status: "todo", auto }];
    const conn: SiteConnection = { id: "c1", provider: "webflow", host: "acme.com", metadata: {}, secret: "tok" };
    const applied = await runAutoChanges(conn, fixes, ["title-tag"], "apply", fn);
    expect(applied[0].auto?.applied?.ok).toBe(true);
    const reverted = await runAutoChanges(conn, applied, ["title-tag"], "revert", fn);
    expect(reverted[0].auto?.revertedAt).toBeTruthy();
  });
});

describe("WordPress", () => {
  const creds = { siteUrl: "https://shop.example.com", username: "olmene", appPassword: "abcd efgh ijkl mnop qrst uvwx" };

  test("resized copies match the original media name", () => {
    expect(mediaBaseName("https://shop.example.com/wp-content/uploads/2026/05/team-photo-1024x768.jpg?v=2")).toBe("team-photo");
    expect(mediaBaseName("/wp-content/uploads/hero-scaled.webp")).toBe("hero");
  });

  test("verify reads capabilities and plugin namespaces with an application password", async () => {
    const { fn, calls } = fakeFetch([
      [/users\/me/, () => json({ id: 3, name: "Olmene", capabilities: { upload_files: true, edit_pages: true } })],
      [/wp-json\/$/, () => json({ namespaces: ["wp/v2", "rankmath/v1"] })],
    ]);
    const acc = await verifyWordpress(fn, creds);
    expect(acc).toMatchObject({ id: 3, canUpload: true, canEditPages: true });
    expect(acc.namespaces).toContain("rankmath/v1");
    expect(calls[0].auth).toBe(`Basic ${btoa("olmene:abcdefghijklmnopqrstuvwx")}`);
  });

  test("plans alt text for library images and Rank Math fields only when exposed", async () => {
    const { fn } = fakeFetch([
      [/wp\/v2\/media\?search=team-photo/, () => json([{ id: 41, source_url: "https://shop.example.com/wp-content/uploads/team-photo.jpg", alt_text: "" }])],
      [/wp\/v2\/settings/, () => json({ show_on_front: "page", page_on_front: 7 })],
      [/wp\/v2\/pages\/7/, () => json({ id: 7, link: "https://shop.example.com/", meta: { rank_math_description: "" } })],
    ]);
    const html = `<img src="https://shop.example.com/wp-content/uploads/team-photo-300x200.jpg"><img src="https://cdn.other.com/x.png">`;
    const plans = await planWordpress(fn, creds, ["image-alt", "title-tag", "meta-description"], {
      title: "Shop — handmade bags", metaDescription: "Handmade leather bags from Athens, shipped worldwide.",
      altTexts: { "https://shop.example.com/wp-content/uploads/team-photo-300x200.jpg": "Our team in the workshop" },
    }, html);
    expect(plans.get("image-alt")!.changes).toEqual([{ field: "media:41.alt_text", label: "Alt text: team-photo", before: null, after: "Our team in the workshop" }]);
    expect(plans.get("meta-description")!.changes[0].field).toBe("meta.rank_math_description");
    expect(plans.has("title-tag")).toBe(false); // rank_math_title not exposed on this site
  });

  test("apply posts each change; revert writes the old value", async () => {
    const { fn, calls } = fakeFetch([[/POST .*wp\/v2\/media\/41/, () => json({ id: 41 })]]);
    const plan = { channel: "wordpress" as const, target: { kind: "media" }, changes: [{ field: "media:41.alt_text", label: "x", before: "old", after: "new" }] };
    expect(await writeWordpress(fn, creds, plan, "apply")).toEqual({ ok: true });
    expect(calls[0].body).toEqual({ alt_text: "new" });
    await writeWordpress(fn, creds, plan, "revert");
    expect(calls[1].body).toEqual({ alt_text: "old" });
  });

  test("refuses http sites and reports refused logins plainly", async () => {
    await expect(verifyWordpress(async () => json({}), { ...creds, siteUrl: "http://shop.example.com" })).rejects.toThrow("https");
    const { fn } = fakeFetch([[/users\/me/, () => json({ code: "invalid_username" }, 401)]]);
    await expect(verifyWordpress(fn, creds)).rejects.toThrow("refused");
  });
});
