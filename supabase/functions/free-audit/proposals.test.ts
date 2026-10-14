// "The fix, before you pay": proposal validation and assembly.
//   deno test --allow-all supabase/functions/free-audit/proposals.test.ts
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { assembleProposals, fieldsToRewrite, type ProposalInput, validateProposal } from "./proposals.ts";

const base: ProposalInput = {
  siteUrl: "https://acme.com/",
  title: "Home",
  metaDescription: null,
  h1: "Analytics for small teams",
  lang: "en",
  pageText: "Acme gives small teams analytics in a day without a data engineer.",
  checklist: [
    { check: "Title tag", status: "warn", detail: "Too short" },
    { check: "Meta description", status: "fail", detail: "Missing" },
    { check: "Open Graph tags", status: "fail", detail: "Missing" },
    { check: "Mobile viewport", status: "pass", detail: "" },
  ],
  hasStructuredData: false,
  preview: null,
  categoryLabel: "Software / SaaS",
};

Deno.test("proposals: only failing fields are rewritten", () => {
  assertEquals(fieldsToRewrite(base), ["title", "metaDescription"]);
  assertEquals(fieldsToRewrite({ ...base, checklist: base.checklist.map((c) => ({ ...c, status: "pass" })) }), []);
});

Deno.test("proposals: validation rejects bad lengths and markup", () => {
  assertThrows(() => validateProposal({ title: { after: "Hi", rationale: "" } }, ["title"]));
  assertThrows(() => validateProposal({ title: { after: "<b>Analytics for small teams</b> | Acme", rationale: "" } }, ["title"]));
  const ok = validateProposal({ title: { after: "Analytics for small teams in a day | Acme", rationale: "Offer first." } }, ["title"]);
  assertEquals(ok.title.after, "Analytics for small teams in a day | Acme");
});

Deno.test("proposals: snippet carries the rewrites and the deterministic tags, escaped", () => {
  const p = assembleProposals(base, {
    title: { after: "Analytics for small teams in a day | Acme", rationale: "Offer first." },
    metaDescription: { after: `Acme gives small teams analytics in a day, no data engineer needed. See your numbers "today".`, rationale: "Who, what, why." },
  }, "vertex/google/gemini");
  assertEquals(p.fields.length, 2);
  assert(p.snippet.startsWith("<title>Analytics for small teams in a day | Acme</title>"));
  assert(p.snippet.includes("&quot;today&quot;"));
  assert(p.tags.some((t) => t.id === "json-ld-org" && t.html.includes('"name":"Acme"')));
  assert(p.tags.some((t) => t.id === "og:title"));
  assert(!p.tags.some((t) => t.id === "viewport"));
  assertEquals(p.previewAfter.serp.title, "Analytics for small teams in a day | Acme");
});
