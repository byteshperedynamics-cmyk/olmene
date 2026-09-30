import { describe, expect, test } from "bun:test";
import { buildPlan } from "../planner";
import type { LlmPort } from "../llm";
import { makeReport } from "./fixtures";

const goodLlm: LlmPort = {
  draftCopy: async () => ({
    metaDescription: "Acme builds fine widgets for teams that ship fast — free tier and Pro at $19/mo.",
    altTexts: { "hero.png": "A rendered Acme widget on a desk" },
    h1: "Fine widgets for teams that ship fast",
  }),
};

const failingLlm: LlmPort = {
  draftCopy: async () => {
    throw new Error("all models failed");
  },
};

describe("planner", () => {
  test("deterministic triggers map report checks to fixers", async () => {
    const plan = await buildPlan(makeReport(), goodLlm);
    const ids = plan.candidates.map((c) => c.fixerId);
    expect(ids).toContain("meta-description");
    expect(ids).toContain("canonical-url");
    expect(ids).toContain("json-ld-org");
    expect(ids).toContain("image-alt");
    expect(ids).toContain("pricing-link");
    expect(ids).toContain("h1-rewrite");
    expect(ids).toContain("sitemap-robots");
    expect(plan.llmStatus).toBe("ok");
    expect(plan.copy.metaDescription).toBeTruthy();
  });

  test("passing checks trigger nothing", async () => {
    const report = makeReport();
    report.audit.seo.checklist = report.audit.seo.checklist.map((c) => ({ ...c, status: "pass" as const }));
    report.audit.messaging = [];
    const plan = await buildPlan(report, goodLlm);
    expect(plan.candidates.length).toBe(0);
    expect(plan.llmStatus).toBe("not_needed");
  });

  test("LLM failure degrades gracefully — deterministic fixers still plan", async () => {
    const plan = await buildPlan(makeReport(), failingLlm);
    expect(plan.llmStatus).toBe("failed");
    const ids = plan.candidates.map((c) => c.fixerId);
    // deterministic fixers survive
    expect(ids).toContain("canonical-url");
    expect(ids).toContain("json-ld-org");
    expect(ids).toContain("pricing-link");
    expect(ids).toContain("sitemap-robots");
    // copy drafts are absent
    expect(plan.copy).toEqual({});
    expect(plan.notes.some((n) => n.includes("Copy drafting failed"))).toBe(true);
  });

  test("actions are capped and ordered", async () => {
    const plan = await buildPlan(makeReport(), goodLlm);
    expect(plan.candidates.length).toBeLessThanOrEqual(8);
    // meta-description before canonical before json-ld before sitemap
    const i = (id: string) => plan.candidates.findIndex((c) => c.fixerId === id);
    expect(i("meta-description")).toBeLessThan(i("canonical-url"));
    expect(i("canonical-url")).toBeLessThan(i("json-ld-org"));
  });
});
