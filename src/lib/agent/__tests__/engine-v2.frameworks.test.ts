// Engine v2: more repositories (Pages Router, Nuxt, SvelteKit, Angular, Vue,
// static site generators) and the business fixers (smart app banner,
// LocalBusiness data from facts found on the page).
import { describe, expect, test } from "bun:test";
import { FIXERS, localBusinessJsonLd, verifyLocalBusiness, type FixerContext } from "../fixers";
import { nuxtHeadEdit, jsxHeadInsert, jsxSetTitle, jsxSetHtmlLang, balanced } from "../frameworks";
import { detectTarget } from "../htmlfile";
import { isAllowedEditPath } from "../allowlist";
import { makeReport } from "./fixtures";

const fixer = (id: string) => FIXERS.find((f) => f.id === id)!;

const PAGES_INDEX = `import Head from "next/head";

export default function Home() {
  return (
    <>
      <Head>
        <title>Home</title>
      </Head>
      <main><h1>Acme</h1></main>
    </>
  );
}
`;
const PAGES_DOCUMENT = `import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html>
      <Head>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
`;
const NUXT_CONFIG = `// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  devtools: { enabled: true },
  modules: ["@nuxt/image"],
});
`;
const NUXT_WITH_HEAD = `export default defineNuxtConfig({
  app: {
    head: {
      title: "Home",
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1" },
      ],
    },
  },
});
`;

function pagesCtx(over: Partial<FixerContext> = {}): FixerContext {
  return {
    report: makeReport(),
    siteUrl: "https://acme.test",
    homepagePath: null,
    homepageHtml: null,
    treePaths: ["next.config.js", "package.json", "pages/index.tsx", "pages/_document.tsx"],
    packageJson: '{"dependencies":{"next":"14.0.0"}}',
    repo: { owner: "o", name: "r", defaultBranch: "main" },
    copy: {
      title: "Acme — analytics for small teams",
      metaDescription: "Acme helps small teams ship faster with plain pricing and a free tier for everyone.",
    },
    framework: { kind: "nextjs-pages", headPath: "pages/_document.tsx", headContent: PAGES_DOCUMENT, pagePath: "pages/index.tsx", pageContent: PAGES_INDEX },
    ...over,
  };
}

describe("repository detection", () => {
  test("Next.js Pages Router, Nuxt, SvelteKit, Angular, Vue CLI", () => {
    expect(detectTarget(["next.config.js", "pages/index.tsx", "pages/_document.tsx", "package.json"])).toMatchObject({ repoType: "nextjs-pages", pagesIndexPath: "pages/index.tsx", pagesDocumentPath: "pages/_document.tsx" });
    expect(detectTarget(["next.config.mjs", "src/pages/index.jsx", "package.json"])).toMatchObject({ repoType: "nextjs-pages", pagesIndexPath: "src/pages/index.jsx" });
    expect(detectTarget(["nuxt.config.ts", "app.vue", "package.json"])).toMatchObject({ repoType: "nuxt", nuxtConfigPath: "nuxt.config.ts" });
    expect(detectTarget(["svelte.config.js", "src/app.html", "src/routes/+page.svelte", "package.json"])).toMatchObject({ repoType: "spa", spaKind: "sveltekit", homepagePath: "src/app.html" });
    expect(detectTarget(["angular.json", "src/index.html", "src/main.ts", "package.json"])).toMatchObject({ repoType: "spa", spaKind: "angular" });
    expect(detectTarget(["public/index.html", "src/main.js", "package.json", "vue.config.js"])).toMatchObject({ repoType: "spa", spaKind: "vue" });
  });

  test("App Router still wins when both app/ and pages/ exist", () => {
    expect(detectTarget(["next.config.js", "app/layout.tsx", "pages/index.tsx"]).repoType).toBe("nextjs-app");
  });

  test("static site generators are refused with a guided-fix reason, never edited as pages", () => {
    const hugo = detectTarget(["hugo.toml", "layouts/index.html", "content/_index.md"]);
    expect(hugo.homepagePath).toBeNull();
    expect(hugo.reason).toContain("Hugo");
    expect(detectTarget(["_config.yml", "_layouts/default.html", "index.html", "Gemfile"]).reason).toContain("Jekyll");
  });

  test("new framework files are on the edit allowlist; other code is not", () => {
    for (const p of ["pages/index.tsx", "src/pages/_document.jsx", "nuxt.config.ts", "components/olmene-local-business.tsx", "src/app.html"]) expect(isAllowedEditPath(p)).toBe(true);
    for (const p of ["pages/about.tsx", "nuxt.config.json", "components/Header.tsx", "src/routes/+page.svelte"]) expect(isAllowedEditPath(p)).toBe(false);
  });
});

describe("Pages Router edits", () => {
  test("title goes into the homepage's next/head as a JS string", () => {
    const out = fixer("title-tag").build(pagesCtx());
    expect("edits" in out).toBe(true);
    if ("edits" in out) {
      expect(out.edits[0].path).toBe("pages/index.tsx");
      expect(out.edits[0].after).toContain('<title>{"Acme — analytics for small teams"}</title>');
      expect(balanced(out.edits[0].after)).toBe(true);
    }
  });

  test("description and canonical are added to the homepage Head; structured data and lang to _document", () => {
    const desc = fixer("meta-description").build(pagesCtx());
    expect("edits" in desc && desc.edits[0].after).toContain('<meta name="description" content="Acme helps small teams');
    const canon = fixer("canonical-url").build(pagesCtx());
    expect("edits" in canon && canon.edits[0].after).toContain('<link rel="canonical" href="https://acme.test/" />');
    const ld = fixer("json-ld-org").build(pagesCtx());
    expect("edits" in ld && ld.edits[0].path).toBe("pages/_document.tsx");
    expect("edits" in ld && ld.edits[0].after).toContain('dangerouslySetInnerHTML={{ __html: JSON.stringify({"@context":"https://schema.org"');
  });

  test("content fixers skip with a reason", () => {
    const out = fixer("h1-rewrite").build(pagesCtx({ copy: { h1: "Analytics for small teams in one afternoon" } }));
    expect("skip" in out && out.skip).toContain("Pages Router");
  });

  test("helpers refuse expression titles and a second <Html lang>", () => {
    const dyn = PAGES_INDEX.replace("<title>Home</title>", "<title>{t('home')}</title>");
    expect(jsxSetTitle(dyn, "New").ok).toBe(false);
    expect(jsxSetHtmlLang(PAGES_DOCUMENT, "en")).toMatchObject({ ok: true });
    expect(jsxSetHtmlLang(PAGES_DOCUMENT.replace("<Html>", '<Html lang="en">'), "de").ok).toBe(false);
    expect(jsxHeadInsert("export default function X() { return <div /> }", "next/head", ["<meta />"]).ok).toBe(false);
  });
});

describe("Nuxt edits", () => {
  test("adds app.head when the config has none", () => {
    const r = nuxtHeadEdit(NUXT_CONFIG, { title: "Acme — analytics", meta: [{ attr: "name", key: "description", content: "Acme helps teams." }], lang: "en" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content).toContain('app: {\n    head: {\n      title: "Acme — analytics",');
      expect(r.content).toContain('htmlAttrs: { lang: "en" }');
      expect(r.content).toContain('modules: ["@nuxt/image"]');
      expect(balanced(r.content)).toBe(true);
    }
  });

  test("edits an existing head: replaces a plain title, appends to meta, keeps the rest", () => {
    const r = nuxtHeadEdit(NUXT_WITH_HEAD, { title: "Acme — analytics", meta: [{ attr: "name", key: "description", content: "Acme helps teams." }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.content).toContain('title: "Acme — analytics",');
      expect(r.content).toContain('{ name: "viewport", content: "width=device-width, initial-scale=1" },\n        { name: "description", content: "Acme helps teams." },');
    }
  });

  test("refuses spreads and computed titles", () => {
    expect(nuxtHeadEdit("export default defineNuxtConfig({ ...base })", { title: "x" }).ok).toBe(false);
    expect(nuxtHeadEdit('export default defineNuxtConfig({ app: { head: { title: process.env.T } } })', { title: "Acme rocks" }).ok).toBe(false);
  });

  test("fixers write nuxt.config and skip component work", () => {
    const ctx = pagesCtx({ treePaths: ["nuxt.config.ts", "package.json"], framework: { kind: "nuxt", headPath: "nuxt.config.ts", headContent: NUXT_CONFIG } });
    const out = fixer("meta-description").build(ctx);
    expect("edits" in out && out.edits[0].path).toBe("nuxt.config.ts");
    expect("skip" in fixer("image-alt").build(ctx)).toBe(true);
    expect("skip" in fixer("canonical-url").build(ctx)).toBe(true);
  });
});

describe("SvelteKit: no duplicates of what <svelte:head> sets", () => {
  test("title skipped when pages manage it; social tags still added to app.html", () => {
    const appHtml = `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n    %sveltekit.head%\n  </head>\n  <body>%sveltekit.body%</body>\n</html>\n`;
    const ctx = pagesCtx({ framework: null, homepagePath: "src/app.html", homepageHtml: appHtml, spa: { kind: "sveltekit", managed: ["title"] }, treePaths: ["svelte.config.js", "src/app.html"] });
    expect("skip" in fixer("title-tag").build(ctx) && (fixer("title-tag").build(ctx) as { skip: string }).skip).toContain("svelte:head");
    const desc = fixer("meta-description").build(ctx);
    expect("edits" in desc).toBe(true);
  });
});

describe("business fixers", () => {
  test("LocalBusiness facts are kept only when found on the page", () => {
    const page = "Smith Plumbing. Call +1 (555) 123-4567. Visit us at 123 Main Street, Springfield 62701. Open Mon–Fri 8:00–18:00.";
    const lb = verifyLocalBusiness({
      name: "Smith Plumbing", telephone: "+1 (555) 123-4567", streetAddress: "123 Main Street", addressLocality: "Springfield",
      postalCode: "62701", addressCountry: "us", openingHours: ["Mo-Fr 08:00-18:00", "Sa 09:00-13:00"],
    }, page, "Smith");
    expect(lb).toEqual({ name: "Smith Plumbing", telephone: "+1 (555) 123-4567", streetAddress: "123 Main Street", addressLocality: "Springfield", postalCode: "62701", addressCountry: "US", openingHours: ["Mo-Fr 08:00-18:00"] });
    expect(verifyLocalBusiness({ name: "X", telephone: "+1 999 000 1111", streetAddress: "1 Fake Road" }, page, "X")).toBeNull();
    const ld = localBusinessJsonLd(lb!, "https://smith.test", false);
    expect(ld["@type"]).toBe("LocalBusiness");
    expect((ld.address as Record<string, string>).streetAddress).toBe("123 Main Street");
  });

  test("LocalBusiness fixer triggers for local sites and writes JSON-LD into static HTML", () => {
    const report = makeReport({ meta: { ...makeReport().meta, category: { id: "local", label: "Local business" }, extras: [{ id: "biz-schema", status: "warn", detail: "missing" }] } });
    expect(fixer("local-business-schema").detect(report).triggered).toBe(true);
    const ctx: FixerContext = {
      ...pagesCtx(), report, framework: null, homepagePath: "index.html", homepageHtml: "<html><head><title>Smith</title></head><body></body></html>", treePaths: ["index.html"],
      copy: { localBusiness: { name: "Smith Plumbing", telephone: "+1 555 123 4567", streetAddress: "123 Main Street" } },
    };
    const out = fixer("local-business-schema").build(ctx);
    expect("edits" in out && out.edits[0].after).toContain('"@type": "LocalBusiness"');
    expect("skip" in fixer("local-business-schema").build({ ...ctx, copy: {} })).toBe(true);
  });

  test("smart app banner from the App Store id the scan found", () => {
    const report = makeReport({ meta: { ...makeReport().meta, appStoreId: "1234567890", extras: [{ id: "biz-smart-banner", status: "warn", detail: "missing" }] } });
    expect(fixer("app-banner").detect(report).triggered).toBe(true);
    const out = fixer("app-banner").build({ ...pagesCtx(), report, framework: null, homepagePath: "index.html", homepageHtml: "<html><head><title>App</title></head><body></body></html>", treePaths: ["index.html"] });
    expect("edits" in out && out.edits[0].after).toContain('<meta name="apple-itunes-app" content="app-id=1234567890">');
    const pages = fixer("app-banner").build(pagesCtx({ report }));
    expect("edits" in pages && pages.edits[0].path).toBe("pages/_document.tsx");
  });
});
