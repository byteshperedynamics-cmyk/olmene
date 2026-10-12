// deno test --allow-all supabase/functions/notify/templates.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { render } from "./templates.ts";

const footer = "You get this because you use Olmene.";

Deno.test("every kind renders with a subject, text and a working link", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["report_ready", { jobId: "j1", site: "acme.io", score: 72, headline: "Clear product, weak proof" }],
    ["pr_opened", { jobId: "a1", repo: "acme/site", prNumber: 12, prUrl: "https://github.com/acme/site/pull/12", fixes: 3 }],
    ["fixes_live", { jobId: "a1", site: "acme.io", passed: 3, total: 3 }],
    ["fix_regression", { jobId: "a1", site: "acme.io", regressed: ["Meta description"] }],
    ["site_regression", { siteId: "s1", site: "acme.io", regressed: [{ check: "Title tag", before: "pass", after: "fail" }], score: 70, previousScore: 78 }],
    ["competitor_change", { site: "acme.io", competitor: "Fathom", url: "https://usefathom.com/", changes: ["New headline: “x”"] }],
    ["weekly_digest", { sites: [{ host: "acme.io", score: 80, delta: 4, regressions: 0, failing: 3 }], awaitingApproval: 1, openPrs: 0 }],
  ];
  for (const [kind, payload] of cases) {
    const r = render(kind, payload, "https://olmene.com", footer);
    assert(r, kind);
    assert(r.subject.length > 5 && r.subject.length < 90, `${kind} subject`);
    assert(r.html.includes(footer), `${kind} footer`);
    assert(!r.text.includes("undefined"), `${kind} text`);
  }
  assertEquals(render("nope", {}, "https://olmene.com", footer), null);
});

Deno.test("user content is escaped in HTML", () => {
  const r = render("report_ready", { jobId: "j1", site: "acme.io", headline: "<script>alert(1)</script>" }, "https://olmene.com", footer)!;
  assert(!r.html.includes("<script>"));
  assert(r.html.includes("&lt;script&gt;"));
});

Deno.test("digests and competitor alerts are optional mail (one-click unsubscribe)", () => {
  assert(render("weekly_digest", { sites: [] }, "https://olmene.com", footer)!.optional);
  assert(!render("pr_opened", { jobId: "a", repo: "a/b", prNumber: 1, prUrl: "https://x", fixes: 1 }, "https://olmene.com", footer)!.optional);
});
