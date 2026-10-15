// deno test --allow-all supabase/functions/notify/templates.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { render } from "./templates.ts";
import { textOn } from "../_shared/email.ts";

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

Deno.test("workspace invitations name who, where and the role, and only link over https", () => {
  const p = { to: "ben@acme.example", workspace: "Acme <Studio>", inviter: "Ana", role: "viewer", link: "https://olmene.com/invite/?t=abc_DEF-123", expiresAt: "2026-10-29T10:00:00Z" };
  const r = render("workspace_invite", p, "https://olmene.com", footer)!;
  assert(r);
  assertEquals(r.subject, "Ana invited you to Acme <Studio> on Olmene");
  assert(r.text.includes("https://olmene.com/invite/?t=abc_DEF-123"));
  assert(r.text.includes("as a viewer"));
  assert(r.text.includes("29 October"));
  assert(!r.html.includes("<Studio>"), "workspace name escaped");
  assert(r.html.includes("Acme &lt;Studio&gt;"));
  assert(!r.html.includes("&amp;lt;"), "not escaped twice");
  assertEquals(render("workspace_invite", { ...p, link: "javascript:alert(1)" }, "https://olmene.com", footer), null);
  assertEquals(render("workspace_invite", { ...p, link: undefined }, "https://olmene.com", footer), null);
  assert(!render("workspace_invite", { ...p, role: "owner", inviter: "" }, "https://olmene.com", footer)!.text.includes("undefined"));
});

Deno.test("client reports: the agency's name and colour, one line per site, the unsubscribe link, escaped", () => {
  const report = {
    client: "Bakery <Brothers>",
    agency: "Northwind Studio",
    brandColor: "#1f6feb",
    logoUrl: "https://x.supabase.co/storage/v1/object/public/brand-assets/w/logo.png",
    whiteLabel: false,
    period: "this week",
    cadence: "weekly",
    sites: [
      { host: "bakery.example", scoreNow: 82, scoreBefore: 78, checksPassing: 18, checksTotal: 21, fixed: 2 },
      { host: "shop.bakery.example", scoreNow: 47, scoreBefore: null, checksPassing: 11, checksTotal: 21, fixed: 0 },
    ],
    pageUrl: "https://olmene.com/c/k7m2xq9pwdab/",
    fromName: "Northwind Studio via Olmene",
    replyTo: "ana@northwind.example",
    test: false,
    unsubscribeUrl: "https://x.supabase.co/functions/v1/notify?unsubscribe_client=" + "a".repeat(64),
  };
  const r = render("client_report", report, "https://olmene.com", "ignored")!;
  assertEquals(r.subject, "Bakery <Brothers>: your websites this week");
  assert(r.optional);
  assert(!r.html.includes("<Brothers>") && r.html.includes("Bakery &lt;Brothers&gt;"), "client name escaped");
  assert(r.html.includes("background:#1f6feb"), "accent colour");
  assert(r.html.includes('src="https://x.supabase.co/storage/v1/object/public/brand-assets/w/logo.png"'), "logo");
  assert(r.html.includes("Up 4 this week") && r.html.includes("First checked this week"), "change per site");
  assert(r.html.includes("18 of 21 checks pass, 2 fixed this week."), "checks line");
  assert(r.html.includes("See the full page") && r.html.includes("https://olmene.com/c/k7m2xq9pwdab/"), "client page button");
  assert(r.html.includes(`unsubscribe_client=${"a".repeat(64)}`) && r.text.includes(`unsubscribe_client=${"a".repeat(64)}`), "unsubscribe in both");
  assert(r.html.includes("Sent by Northwind Studio with Olmene."), "credit");
  assert(r.text.includes("Questions? Reply to this email to reach Northwind Studio."), "reply line");
  assert(!r.html.includes("ignored"), "brings its own footer");
});

Deno.test("client reports: white label drops Olmene's name; tests carry no unsubscribe; real ones need it", () => {
  const base = {
    client: "Harbor Dental",
    agency: "Northwind Studio",
    brandColor: "#f5d90a",
    logoUrl: null,
    whiteLabel: true,
    period: "in October",
    cadence: "monthly",
    sites: [{ host: "harbordental.example", scoreNow: 61, scoreBefore: 61, checksPassing: 9, checksTotal: 21, fixed: 0 }],
    pageUrl: null,
    replyTo: null,
    test: false,
    unsubscribeUrl: "https://x.supabase.co/functions/v1/notify?unsubscribe_client=" + "b".repeat(64),
  };
  const wl = render("client_report", base, "https://olmene.com", "")!;
  assertEquals(wl.subject, "Harbor Dental: your website in October");
  assert(!/olmene/i.test(wl.html.replace(/https:\/\/[^\s"<>]+/g, "")), "no Olmene name outside links");
  assert(wl.html.includes("No change in October"));
  assert(!wl.html.includes("See the full page"), "no button without a client page");
  const withPage = render("client_report", { ...base, pageUrl: "https://olmene.com/c/k7m2xq9pwdab/" }, "https://olmene.com", "")!;
  assert(withPage.html.includes("background:#f5d90a;color:#1C1D1B;"), "dark text on a light accent");
  assertEquals(textOn("#1f6feb"), "#FFFFFF");
  assertEquals(textOn("#f5d90a"), "#1C1D1B");

  const test = render("client_report", { ...base, test: true, unsubscribeUrl: null }, "https://olmene.com", "")!;
  assertEquals(test.subject, "[Test] Harbor Dental: your website in October");
  assert(!test.optional && !test.html.includes("unsubscribe_client"));
  assert(test.html.includes("This is a test."));

  assertEquals(render("client_report", { ...base, unsubscribeUrl: null }, "https://olmene.com", ""), null, "never without an unsubscribe link");
  assertEquals(render("client_report", { ...base, sites: [] }, "https://olmene.com", ""), null, "nothing to report");
});
