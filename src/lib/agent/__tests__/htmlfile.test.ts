import { describe, expect, test } from "bun:test";
import {
  addAltAttributes,
  addPricingLink,
  buildRobotsTxt,
  buildSitemapXml,
  detectTarget,
  findImagesWithoutAlt,
  insertCanonical,
  insertJsonLd,
  insertMetaDescription,
  replaceH1Text,
} from "../htmlfile";

const HOMEPAGE = [
  "<!DOCTYPE html>",
  "<html lang=\"en\">",
  "<head>",
  "  <title>Acme — Widgets</title>",
  "</head>",
  "<body>",
  "  <nav><a href=\"/\" class=\"nav-link\">Home</a> <a href=\"/about\" class=\"nav-link\">About</a></nav>",
  "  <h1>We build widgets</h1>",
  "  <main><p>Acme makes the finest widgets for teams.</p>",
  "  <img src=\"hero.png\" class=\"hero\"></main>",
  "  <footer><p>© Acme</p></footer>",
  "</body>",
  "</html>",
].join("\n");

describe("target detection", () => {
  test("root index.html wins for static sites", () => {
    expect(detectTarget(["index.html", "style.css", "about.html"]).homepagePath).toBe("index.html");
  });

  test("single common-dir candidate is accepted", () => {
    expect(detectTarget(["site/index.html", "site/style.css"]).homepagePath).toBe("site/index.html");
    expect(detectTarget(["docs/index.html"]).homepagePath).toBe("docs/index.html");
  });

  test("ambiguous candidates are refused (skip rather than guess)", () => {
    const d = detectTarget(["site/index.html", "docs/index.html"]);
    expect(d.homepagePath).toBeNull();
    expect(d.reason).toContain("Multiple index.html");
  });

  test("framework repos are explicitly unsupported in v1", () => {
    const d = detectTarget(["package.json", "next.config.ts", "src/app/page.tsx"]);
    expect(d.homepagePath).toBeNull();
    expect(d.repoType).toBe("framework");
    expect(d.reason).toContain("static HTML");
  });

  test("no html at all", () => {
    expect(detectTarget(["README.md", "main.py"]).homepagePath).toBeNull();
  });
});

describe("edit operations", () => {
  test("meta description is inserted after </title> with matching indent", () => {
    const out = insertMetaDescription(HOMEPAGE, "Acme builds fine widgets for teams that ship fast.");
    expect(out).toContain("<title>Acme — Widgets</title>\n  <meta name=\"description\" content=\"Acme builds fine widgets for teams that ship fast.\">");
    expect(out?.split("\n").length).toBe(HOMEPAGE.split("\n").length + 1);
  });

  test("existing meta description is replaced in place", () => {
    const html = HOMEPAGE.replace(
      "</title>",
      "</title>\n  <meta name=\"description\" content=\"old\">",
    );
    const out = insertMetaDescription(html, "brand new description text");
    expect(out).toContain('content="brand new description text"');
    expect(out).not.toContain("old");
  });

  test("meta content is escaped", () => {
    const out = insertMetaDescription(HOMEPAGE, 'Evil "onload=alert(1) <script>');
    expect(out).not.toContain('"onload');
    expect(out).not.toContain("<script>");
  });

  test("canonical is inserted into head", () => {
    const out = insertCanonical(HOMEPAGE, "https://acme.test/");
    expect(out).toContain('<link rel="canonical" href="https://acme.test/">');
  });

  test("canonical is skipped when already present", () => {
    const html = HOMEPAGE.replace("</head>", '  <link rel="canonical" href="https://x.test/">\n</head>');
    expect(insertCanonical(html, "https://acme.test/")).toBeNull();
  });

  test("JSON-LD is appended before </head> as a @graph", () => {
    const out = insertJsonLd(HOMEPAGE, { "@context": "https://schema.org", "@graph": [{ "@type": "Organization", name: "Acme" }] });
    expect(out).toContain('<script type="application/ld+json">');
    expect(out).toContain('"@graph"');
    expect(out).toContain('"Organization"');
    // existing markup preserved
    expect(out).toContain("<title>Acme — Widgets</title>");
  });

  test("images without alt are found and patched with preserved attrs", () => {
    const imgs = findImagesWithoutAlt(HOMEPAGE);
    expect(imgs.length).toBe(1);
    expect(imgs[0].src).toBe("hero.png");
    const out = addAltAttributes(HOMEPAGE, new Map([["hero.png", "A rendered Acme widget on a desk"]]));
    expect(out).toContain('<img src="hero.png" class="hero" alt="A rendered Acme widget on a desk">');
    // existing alt untouched
    const withAlt = HOMEPAGE.replace("<img src=\"hero.png\" class=\"hero\">", '<img src="hero.png" class="hero" alt="ok">');
    expect(findImagesWithoutAlt(withAlt).length).toBe(0);
    expect(addAltAttributes(withAlt, new Map())).toBe(withAlt);
  });

  test("pricing link reuses sibling classes in the nav", () => {
    const out = addPricingLink(HOMEPAGE, "/pricing.html");
    expect(out).toContain('class="nav-link" href="/pricing.html"');
    expect(out?.match(/nav-link/g)?.length).toBe(3);
  });

  test("pricing link is skipped when a pricing link exists", () => {
    const html = HOMEPAGE.replace('<a href="/about" class="nav-link">About</a>', '<a href="/about" class="nav-link">About</a> <a href="/pricing.html" class="nav-link">Pricing</a>');
    expect(addPricingLink(html, "/pricing.html")).toBeNull();
  });

  test("H1 text is replaced when exactly one h1 exists", () => {
    const out = replaceH1Text(HOMEPAGE, "Widgets that ship themselves");
    expect(out).toContain("<h1>Widgets that ship themselves</h1>");
    expect(out).not.toContain("We build widgets");
  });

  test("robots.txt and sitemap.xml builders", () => {
    expect(buildRobotsTxt("https://acme.test/")).toBe(
      "User-agent: *\nAllow: /\n\nSitemap: https://acme.test/sitemap.xml\n",
    );
    const sm = buildSitemapXml(["https://acme.test/", "https://acme.test/pricing.html"], "2026-09-29");
    expect(sm).toContain("<loc>https://acme.test/</loc>");
    expect(sm).toContain("<lastmod>2026-09-29</lastmod>");
    expect(sm.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });
});

// ── Regressions from the real-repo evaluation (2026-10-02) ─────────────────

describe("addPricingLink on real-world markup", () => {
  test("never clones a link from body copy (mdn/beginner-html-site-styled)", () => {
    const html = '<html><head></head><body><h1>Hi</h1><p>Read the <a href="https://x.org/m">Mozilla Manifesto</a> to learn more.</p></body></html>';
    expect(addPricingLink(html, "/pricing.html")).toBeNull();
  });

  test("label is always 'Pricing', never the sibling's text", () => {
    const html = '<nav><a href="/" class="nav">Home</a> <a href="/about" class="nav">About us</a></nav>';
    const out = addPricingLink(html, "/pricing.html")!;
    expect(out).toContain('<a class="nav" href="/pricing.html">Pricing</a>');
    expect(out.match(/About us/g)?.length).toBe(1);
  });

  test("adds a sibling <li> when links live in a list", () => {
    const html = '<nav><ul class="menu"><li class="item"><a href="/">Home</a></li><li class="item"><a href="/blog">Blog</a></li></ul></nav>';
    const out = addPricingLink(html, "/pricing/")!;
    expect(out).toContain('<li class="item"><a href="/blog">Blog</a></li><li class="item"><a href="/pricing/">Pricing</a></li></ul>');
  });
});

describe("head insertions keep the file's indentation", () => {
  const html = "<html>\n  <head>\n    <meta charset=\"utf-8\">\n    <title>Acme</title>\n  </head>\n  <body></body>\n</html>";

  test("canonical uses the children's indent", () => {
    expect(insertCanonical(html, "https://acme.test/")).toContain('\n    <link rel="canonical" href="https://acme.test/">');
  });

  test("JSON-LD block sits before </head> without stealing its indent", () => {
    const out = insertJsonLd(html, { "@context": "https://schema.org", "@type": "Organization" })!;
    expect(out).toContain('    <script type="application/ld+json">\n      {');
    expect(out).toContain("    </script>\n  </head>");
  });
});
