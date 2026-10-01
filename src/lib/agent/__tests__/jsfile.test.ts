import { describe, expect, test } from "bun:test";
import { addBodyComponent, addMetadataCanonical, codeMask, findMetadataObject, setMetadataString } from "../jsfile";

const LAYOUT = `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

// metadata below — don't touch "this" string { }
export const metadata: Metadata = {
  title: "Acme",
  openGraph: { images: ["/og.png"], title: \`Acme \${"x"}\` },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
`;

describe("codeMask", () => {
  test("strings, comments and templates are masked; code is not", () => {
    const src = `const a = "{"; // }\nconst b = \`x\${ {y:1}.y }z\`; /* { */ const c = {};`;
    const mask = codeMask(src);
    const codeBraces = [...src].map((ch, i) => (mask[i] && (ch === "{" || ch === "}") ? ch : "")).join("");
    // only the object inside ${…} and the final {} are code braces
    expect(codeBraces).toBe("{}{}");
  });
});

describe("findMetadataObject", () => {
  test("finds the object and its top-level props", () => {
    const obj = findMetadataObject(LAYOUT);
    if ("reason" in obj) throw new Error(obj.reason);
    expect(obj.props.map((p) => p.key)).toEqual(["title", "openGraph"]);
    expect(obj.props[0].stringLiteral).toBe(true);
    expect(obj.props[1].stringLiteral).toBe(false);
    expect(obj.indent).toBe("  ");
  });

  test("refuses generateMetadata", () => {
    const r = findMetadataObject(`export async function generateMetadata() { return {} }`);
    expect("reason" in r && r.reason).toContain("generateMetadata");
  });

  test("refuses spreads and non-literal metadata", () => {
    expect("reason" in findMetadataObject(`export const metadata = { ...base, title: "x" };`)).toBe(true);
    expect("reason" in findMetadataObject(`export const metadata = buildMeta();`)).toBe(true);
    expect("reason" in findMetadataObject(`export const metadata = { [k]: "x" };`)).toBe(true);
  });

  test("missing metadata export is a skip, not a crash", () => {
    const r = findMetadataObject(`export default function L() { return null }`);
    expect("reason" in r).toBe(true);
  });
});

describe("setMetadataString", () => {
  test("inserts description with matching indentation, preserving everything else", () => {
    const r = setMetadataString(LAYOUT, "description", "See where users drop off and fix it in a day.");
    if (!r.ok) throw new Error(r.reason);
    expect(r.content).toContain(`export const metadata: Metadata = {\n  description: "See where users drop off and fix it in a day.",\n  title: "Acme",`);
    // byte-identical outside the inserted line
    expect(r.content.replace(`\n  description: "See where users drop off and fix it in a day.",`, "")).toBe(LAYOUT);
  });

  test("replaces a plain string literal", () => {
    const r = setMetadataString(LAYOUT, "title", "Acme — Product analytics");
    if (!r.ok) throw new Error(r.reason);
    expect(r.content).toContain(`title: "Acme — Product analytics",`);
    expect(r.content).not.toContain(`title: "Acme",`);
  });

  test("refuses to rewrite expression values", () => {
    const src = `export const metadata = { description: site.description };`;
    const r = setMetadataString(src, "description", "x".repeat(60));
    expect(r.ok).toBe(false);
  });

  test("escapes quotes safely", () => {
    const r = setMetadataString(LAYOUT, "description", `Say "hi" to Acme's widgets`);
    if (!r.ok) throw new Error(r.reason);
    expect(r.content).toContain(`description: "Say \\"hi\\" to Acme's widgets",`);
  });

  test("single-line and empty objects", () => {
    const one = setMetadataString(`export const metadata = { title: "A" };`, "description", "D");
    expect(one.ok && one.content).toBe(`export const metadata = { description: "D", title: "A" };`);
    const empty = setMetadataString(`export const metadata = {};`, "description", "D");
    expect(empty.ok && empty.content).toBe(`export const metadata = {\n  description: "D",\n};`);
  });
});

describe("addMetadataCanonical", () => {
  test("adds alternates when absent", () => {
    const r = addMetadataCanonical(LAYOUT, "https://acme.com");
    if (!r.ok) throw new Error(r.reason);
    expect(r.content).toContain(`alternates: { canonical: "https://acme.com" },`);
  });
  test("leaves existing alternates alone", () => {
    const r = addMetadataCanonical(`export const metadata = { alternates: { languages: {} } };`, "https://acme.com");
    expect(r.ok).toBe(false);
  });
});

describe("addBodyComponent", () => {
  test("imports after the last import and renders as the first body child", () => {
    const r = addBodyComponent(LAYOUT, "OlmeneJsonLd", "../components/olmene-jsonld");
    if (!r.ok) throw new Error(r.reason);
    expect(r.content).toContain(`import "./globals.css";\nimport { OlmeneJsonLd } from "../components/olmene-jsonld";`);
    expect(r.content).toContain(`<body className={inter.className}>\n        <OlmeneJsonLd />{children}</body>`);
  });

  test("handles > inside attribute expressions", () => {
    const src = `export default function L({ children }) {\n  return (\n    <html>\n      <body className={a > b ? "x" : "y"}>\n        {children}\n      </body>\n    </html>\n  );\n}\n`;
    const r = addBodyComponent(src, "OlmeneJsonLd", "../components/olmene-jsonld");
    if (!r.ok) throw new Error(r.reason);
    expect(r.content).toContain(`<body className={a > b ? "x" : "y"}>\n        <OlmeneJsonLd />`);
    expect(r.content.startsWith(`import { OlmeneJsonLd } from "../components/olmene-jsonld";\n`)).toBe(true);
  });

  test("refuses when there is no single body or the component exists", () => {
    expect(addBodyComponent(`export default () => <div/>`, "X", "./x").ok).toBe(false);
    expect(addBodyComponent(`import { X } from "./x";\n<body><X/></body>`, "X", "./x").ok).toBe(false);
  });
});
