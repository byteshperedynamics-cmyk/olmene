import { describe, expect, test } from "bun:test";
import { buildActionPlan, reportToMarkdown } from "@/lib/format";
import { SAMPLE_REPORT } from "@/lib/sample-report";
import { makeReport } from "@/lib/agent/__tests__/fixtures";

describe("report exports", () => {
  test("fictional sample labels Markdown and omits every placeholder source URL", () => {
    const markdown = reportToMarkdown(SAMPLE_REPORT, true);
    expect(markdown).toContain("FICTIONAL EXAMPLE — NOT A REAL AUDIT");
    expect(markdown).toContain("placeholder references");
    for (const source of SAMPLE_REPORT.sources) expect(markdown).not.toContain(source.url);
    expect(markdown).not.toContain(SAMPLE_REPORT.meta.siteUrl);
    expect(markdown).not.toContain("from public web data");
  });

  test("fictional sample labels the copied action plan", () => {
    const plan = buildActionPlan(SAMPLE_REPORT, true);
    expect(plan).toStartWith("FICTIONAL EXAMPLE — NOT A REAL ACTION PLAN");
    expect(plan).toContain(SAMPLE_REPORT.product.name);
  });

  test("real report exports retain their source URLs and normal wording", () => {
    const report = makeReport();
    const markdown = reportToMarkdown(report);
    expect(markdown).toContain(report.meta.siteUrl);
    expect(markdown).toContain(report.sources[0].url);
    expect(markdown).toContain("from public web data");
    expect(markdown).not.toContain("FICTIONAL EXAMPLE");
    expect(buildActionPlan(report)).not.toContain("FICTIONAL EXAMPLE");
  });
});
