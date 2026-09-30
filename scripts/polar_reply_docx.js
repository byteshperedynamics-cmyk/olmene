/**
 * Draft reply to Polar.sh product review — DOCX generator
 * Letter-style English document: no cover, no TOC, Times New Roman,
 * black headings, right-aligned closing, footer page number.
 */
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageNumber, AlignmentType, HeadingLevel, WidthType,
  BorderStyle, ShadingType, LevelFormat, ExternalHyperlink,
} = require("docx");
const fs = require("fs");

const OUT = "/home/z/my-project/download/Polar-review-reply-draft.docx";

const FONT = { ascii: "Times New Roman", eastAsia: "SimSun" };
const BLACK = "000000";
const GRAY = "595959";
const LINK = "0B5394";

/* ---------- helpers ---------- */

function body(children, opts = {}) {
  const kids = Array.isArray(children) ? children : [new TextRun({ text: children, size: 24, font: FONT, color: BLACK })];
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { after: opts.after ?? 160, line: 312, before: opts.before ?? 0 },
    keepNext: opts.keepNext || false,
    children: kids,
  });
}

function run(text, o = {}) {
  return new TextRun({ text, size: o.size || 24, bold: o.bold || false, italics: o.italics || false, font: FONT, color: o.color || BLACK });
}

function link(text, url) {
  return new ExternalHyperlink({
    link: url,
    children: [new TextRun({ text, size: 24, font: FONT, color: LINK, underline: {} })],
  });
}

function bullet(children) {
  const kids = Array.isArray(children) ? children : [run(children)];
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 80, line: 312 }, children: kids });
}

function numbered(text, ref) {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 100, line: 312 },
    children: [run(text)],
  });
}

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { before: 0, after: 120, line: 312 }, children: [new TextRun({ text, bold: true, size: 32, font: FONT, color: BLACK })] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 140, line: 312 }, children: [new TextRun({ text, bold: true, size: 28, font: FONT, color: BLACK })] });
}
function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 240, after: 120, line: 312 }, children: [new TextRun({ text, bold: true, size: 26, font: FONT, color: BLACK })] });
}

const CELL_MARGIN = { top: 80, bottom: 80, left: 120, right: 120 };

function cellParas(text, bold, colorHex) {
  const lines = text.split("\n");
  return lines.map((ln) => new Paragraph({
    spacing: { after: 20, line: 280 },
    children: [new TextRun({ text: ln, size: 20, bold: bold, font: FONT, color: colorHex || BLACK })],
  }));
}

function cell(text, widthPct, opts = {}) {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    margins: CELL_MARGIN,
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill } : undefined,
    children: cellParas(text, opts.bold || false, opts.color),
  });
}

/* ---------- product overview table ---------- */

const TABLE_HEADER = ["Product", "Price", "What it is", "How it is delivered"];
const TABLE_ROWS = [
  ["Trisle", "€3.99, one-time", "Android app that recreates the iPhone Dynamic Island: a pill-shaped capsule that morphs to show live alerts and ongoing activities", "Instant download after checkout, plus lifetime updates"],
  ["MarketWise Starter", "€19/month", "Subscription to the MarketWise web app: 2 full marketing analyses per month", "Activated in the customer account within seconds of payment"],
  ["MarketWise Pro", "€29/month", "Subscription: 4 full analyses per month, priority support, capacity to re-audit monthly", "Activated in the customer account within seconds of payment"],
  ["Single Report", "€14, one-time", "One full MarketWise analysis for one website, no subscription", "Activated in the account; credit valid for 90 days"],
];
const COL_W = [16, 14, 40, 30];

const overviewTable = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: {
    top: { style: BorderStyle.SINGLE, size: 4, color: "8A8F98" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "8A8F98" },
    left: { style: BorderStyle.NONE },
    right: { style: BorderStyle.NONE },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "C9CDD4" },
    insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "DDE0E5" },
  },
  rows: [
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: TABLE_HEADER.map((t, i) => cell(t, COL_W[i], { bold: true, fill: "EEF1F5" })),
    }),
    ...TABLE_ROWS.map((r) => new TableRow({
      cantSplit: true,
      children: r.map((t, i) => cell(t, COL_W[i])),
    })),
  ],
});

/* ---------- document ---------- */

const children = [
  h1("Draft Reply — Polar Product Review"),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 280, line: 312 },
    children: [run("Prepared 29 September 2026 · Recipient: Isak, Polar (merchant of record) · Fill the 【bracketed】 fields before sending", { size: 21, color: GRAY })],
  }),

  h2("Suggested subject line"),
  body([run("Re: Clarifying the products in our Polar catalog", { bold: true })]),

  h2("Reply draft"),

  body("Hi Isak,"),

  body("Thank you for the follow-up, and for setting out so clearly what you need from us. Below is a full breakdown of every product that has appeared in the catalog: what it does, what the customer receives, how it is delivered after payment, and where the product and pricing pages live. One product, FoldFX, has been discontinued and deleted — its status is set out below. At the end, we propose how to split the remaining products across Polar organizations so that each distinct use case sits in its own organization, as your policy requires."),

  h3("1. Which products belong to the approved Android app"),
  body([
    run("Trisle (€3.99, one-time purchase) is the approved Android Dynamic Island app — the product shown on the website you have on file. None of the other products belong to that app: FoldFX was a separate Android app that we have since discontinued and deleted, and MarketWise Starter, MarketWise Pro and Single Report are three pricing tiers of a single web-based marketing analysis service."),
  ]),

  h3("2. Product-by-product overview"),
  body("The table below summarizes the four products currently for sale; the paragraphs that follow add detail on each app and on the MarketWise service, and on the status of FoldFX.", { keepNext: true }),
  overviewTable,
  body("", { after: 60 }),

  body([run("Trisle — ", { bold: true }), run("an Android utility that recreates the iPhone Dynamic Island on Android. It floats a pill-shaped capsule at the top of the screen, above every app, and morphs it to show live alerts, notifications and ongoing activities such as music playback, timers, calls and navigation. It runs on Android 7.0 and above, is optimized for Android 12 through 16, and adapts to any camera cutout. All processing happens on the device: the app collects nothing and contains no analytics or tracking SDKs. Customers receive the full app and all future updates for the one-time price. Product page: "), link("https://trisle-app.github.io/Trisle_Website/", "https://trisle-app.github.io/Trisle_Website/")]),

  body([run("FoldFX (€4.99) — ", { bold: true }), run("discontinued and deleted. FoldFX was a separate Android app for foldable phones; it recreated a fluid, hinge-driven fold and unfold transition. We have since discontinued the project: the product has been deleted, it is no longer for sale, and its product page (https://roodynorman21.github.io) is down. It was a one-time purchase with no subscriptions, so no recurring obligations are attached to it. If it still appears as a listing in the current organization, we will make sure it is removed.")]),

  h3("3. What MarketWise and the Single Report provide"),
  body("MarketWise is a web application for small businesses and founders. The customer enters their website URL; MarketWise then runs live web research on the site, its market and its competitors, followed by a multi-step AI analysis, and generates a full marketing diagnostic report. All three MarketWise products deliver the same unit — one full analysis — and differ only in volume and support:"),
  bullet([run("Starter (€19/month): ", { bold: true }), run("2 full marketing analyses per month.")]),
  bullet([run("Pro (€29/month): ", { bold: true }), run("4 full marketing analyses per month, priority support, and enough capacity to re-audit a site monthly and track what moved.")]),
  bullet([run("Single Report (€14, one-time): ", { bold: true }), run("one full analysis for one website. No subscription; the report credit is valid for 90 days.")]),

  body("Each full analysis contains the following information:", { before: 80, keepNext: true }),
  bullet("Market and competitor research, with every market claim backed by a cited, checkable source."),
  bullet("A five-part website audit and an 18-point SEO checklist."),
  bullet("A scored diagnostic report showing how the site performs across the main marketing dimensions."),
  bullet("A prioritized 7/30/60/90-day action roadmap with KPIs."),
  bullet("Export options: Markdown, print-to-PDF, and a copyable action plan."),

  body([run("A complete sample report — exactly what a customer receives — is publicly viewable at "), link("https://get.marketwiselabs.workers.dev/sample-report/", "https://get.marketwiselabs.workers.dev/sample-report/"), run(".")], { before: 80 }),

  body("How delivery works after payment: checkout is embedded in the application and processed by Polar. After payment, Polar redirects the customer back to the app, and a Polar webhook activates their entitlement (the subscription or the report credit) within seconds. The customer then runs their analyses from their account dashboard; a report takes a few minutes to generate and remains in the account permanently, where it can be re-read and exported at any time. Subscriptions can be cancelled at any time, with access running to the end of the paid period, and failed analyses never consume the customer's quota."),

  body("There is also a free tier: anyone can run a free instant audit of their site without payment. The paid products unlock the full cited research, audit and roadmap described above."),

  body("Product and pricing pages:", { keepNext: true }),
  bullet([run("Landing page: "), link("https://get.marketwiselabs.workers.dev", "https://get.marketwiselabs.workers.dev")]),
  bullet([run("Pricing, all three plans: "), link("https://get.marketwiselabs.workers.dev/pricing", "https://get.marketwiselabs.workers.dev/pricing")]),
  bullet([run("Sample report: "), link("https://get.marketwiselabs.workers.dev/sample-report", "https://get.marketwiselabs.workers.dev/sample-report")]),

  h3("4. Splitting into separate organizations"),
  body("Understood — each distinct use case needs its own organization and independent review. With FoldFX deleted, only one new organization is needed. We propose the following structure:"),
  bullet([run("Current organization: ", { bold: true }), run("Trisle only, the approved Android Dynamic Island app.")]),
  bullet([run("New organization: ", { bold: true }), run("MarketWise — Starter, Pro and Single Report together (one use case: the marketing analysis service), submitted for independent review.")]),

  body("Two questions so that we handle the transition correctly:", { before: 80, keepNext: true }),
  numbered("Would you like us to disable the MarketWise products in the current organization immediately, while the new organization is set up and reviewed?", "polar-questions"),
  numbered("How should existing orders and subscriptions for products that move to a new organization be handled — is there a migration path, or should they run their course in the current organization?", "polar-questions"),

  body("We are happy to provide anything else that helps the review: screenshots of the report interface, a walkthrough of the purchase and delivery flow, or anything else you need.", { before: 80 }),

  new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 300, after: 40, line: 312 }, children: [run("Best regards,")] }),
  new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0, line: 312 }, children: [run("【Your name】")] }),

  h2("Before sending — quick checklist"),
  bullet("Fill in 【Your name】 in the signature and adjust the sign-off if you prefer a different closing."),
  bullet("Confirm FoldFX actually shows as deleted/unlisted in the Polar dashboard — if it is still visible on their side, delete it there before sending so the reply matches what Polar sees."),
  bullet("Consider aligning the price labels on the MarketWise site (currently shown as $19 / $29 / $14) with the EUR prices charged at Polar checkout (€19 / €29 / €14), so buyers see one consistent currency during review."),
];

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: FONT, size: 24, color: BLACK },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: { run: { font: FONT, size: 32, bold: true, color: BLACK }, paragraph: { spacing: { before: 0, after: 120, line: 312 } } },
      heading2: { run: { font: FONT, size: 28, bold: true, color: BLACK }, paragraph: { spacing: { before: 300, after: 140, line: 312 } } },
      heading3: { run: { font: FONT, size: 26, bold: true, color: BLACK }, paragraph: { spacing: { before: 240, after: 120, line: 312 } } },
    },
  },
  numbering: {
    config: [
      {
        reference: "polar-questions",
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: "%1.",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: "Polar review — draft reply", size: 18, color: "888888", font: FONT })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, font: FONT })],
          })],
        }),
      },
      children,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log("WROTE", OUT, buf.length, "bytes");
});
