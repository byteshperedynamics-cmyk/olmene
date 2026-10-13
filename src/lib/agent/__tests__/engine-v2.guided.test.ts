// Engine v2: guided fixes for sites that aren't in a GitHub repository.
import { describe, expect, test } from "bun:test";
import { buildGuidedFixes, livePreviewFor } from "../guided/build";
import { detectWordpressSeoPlugin, GUIDED_PLATFORM_IDS, playbookFor } from "../guided/playbooks";
import { runLiveCheck } from "../live-check";
import { makeReport } from "./fixtures";

const LIVE = `<!doctype html><html><head><title>Home</title></head><body>
<h1>Welcome</h1><img src="/img/team.jpg"><p>We help small teams ship analytics in a day without a data engineer, for the price of a lunch.</p></body></html>`;

function report() {
  const r = makeReport();
  r.meta.siteUrl = "https://acme.test";
  r.audit.seo.checklist = [
    { check: "Title tag", status: "warn", detail: "4 characters" },
    { check: "Meta description", status: "fail", detail: "missing" },
    { check: "Structured data (JSON-LD)", status: "warn", detail: "none" },
    { check: "Image alt coverage", status: "fail", detail: "1 of 1 images have no alt" },
    { check: "Language attribute", status: "warn", detail: "No lang attribute on <html>" },
  ];
  r.meta.extras = [{ id: "llms-txt", status: "warn", detail: "missing" }];
  r.meta.pageExcerpt = "We help you and your team with the numbers that matter. Our tool is for founders and for the people that run small shops, and you can try it with your own data. This is the fastest way for you to see what your customers do, and we are here for you with the setup and the questions that come with it.";
  return r;
}
const copy = { title: "Acme — analytics for small teams", metaDescription: "Acme gives small teams analytics in a day without a data engineer. Plain pricing, free tier.", altTexts: { "/img/team.jpg": "The Acme team at work" } };

describe("playbooks", () => {
  test("every platform the scan names has its own playbook; WordPress follows the SEO plugin", () => {
    for (const id of ["shopify", "webflow", "wix", "squarespace", "framer", "ghost", "hubspot", "duda", "godaddy", "squareonline", "bigcommerce", "jimdo", "carrd", "tilda", "drupal", "joomla", "magento", "prestashop", "bubble", "wordpress"]) {
      expect(GUIDED_PLATFORM_IDS).toContain(id);
    }
    expect(playbookFor("wordpress", { wordpressPlugin: "rankmath" }).seo.join(" ")).toContain("Rank Math");
    expect(playbookFor("wordpress", { wordpressPlugin: "none" }).seo.join(" ")).toContain("install");
    expect(playbookFor("hugo").seo.join(" ")).toContain("head partial");
    expect(playbookFor("something-new").label).toBe("Your platform");
    expect(detectWordpressSeoPlugin('<script class="yoast-schema-graph">')).toBe("yoast");
    expect(detectWordpressSeoPlugin("<!-- Search Engine Optimization by Rank Math -->")).toBe("rankmath");
  });
});

describe("guided fix cards", () => {
  test("values to paste with the current value, steps from the platform", () => {
    const run = buildGuidedFixes({ report: report(), copy, playbook: playbookFor("shopify"), liveHtml: LIVE });
    const byId = Object.fromEntries(run.fixes.map((f) => [f.id, f]));
    expect(byId["title-tag"].values[0]).toMatchObject({ value: copy.title, current: "Home", kind: "text" });
    expect(byId["title-tag"].steps[0]).toContain("Online Store → Preferences");
    expect(byId["json-ld-org"].values[0].kind).toBe("code");
    expect(byId["json-ld-org"].steps.join(" ")).toContain("theme.liquid");
    expect(byId["image-alt"].values[0]).toMatchObject({ label: "team.jpg", value: "The Acme team at work" });
    expect(byId["lang-attribute"].values[0].value).toContain("(en)");
    // Shopify can't host llms.txt at the root: the card says so instead of steps.
    expect(byId["llms-txt"].status).toBe("blocked");
    expect(byId["llms-txt"].blocked).toContain("llms.txt");
    expect(run.platform.label).toBe("Shopify");
  });

  test("platforms without head code block the code-only fixes honestly", () => {
    const run = buildGuidedFixes({ report: report(), copy, playbook: playbookFor("godaddy"), liveHtml: LIVE });
    const ld = run.fixes.find((f) => f.id === "json-ld-org")!;
    expect(ld.status).toBe("blocked");
    expect(ld.blocked).toContain("GoDaddy");
  });

  test("no copy, no card: a fix without a value is left out rather than guessed", () => {
    const run = buildGuidedFixes({ report: report(), copy: {}, playbook: playbookFor("wix"), liveHtml: LIVE });
    expect(run.fixes.find((f) => f.id === "title-tag")).toBeUndefined();
    expect(run.fixes.find((f) => f.id === "json-ld-org")).toBeDefined();
  });

  test("live check confirms a pasted title and spots one that isn't live yet", async () => {
    const run = buildGuidedFixes({ report: report(), copy, playbook: playbookFor("wix"), liveHtml: LIVE });
    const title = run.fixes.find((f) => f.id === "title-tag")!;
    const page = (t: string) => async () => new Response(`<html><head><title>${t}</title></head></html>`, { status: 200 });
    const ok = await runLiveCheck("https://acme.test", [{ fixer_id: "title-tag", preview: livePreviewFor(title) }], page(copy.title));
    expect(ok.results[0].ok).toBe(true);
    const not = await runLiveCheck("https://acme.test", [{ fixer_id: "title-tag", preview: livePreviewFor(title) }], page("Home"));
    expect(not.results[0].ok).toBe(false);
  });
});
