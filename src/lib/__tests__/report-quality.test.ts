// Report quality score: deterministic deductions.
import { describe, expect, test } from "bun:test";
import { scoreReport } from "@/lib/report-quality";
import { makeReport } from "@/lib/agent/__tests__/fixtures";

describe("report quality score", () => {
  test("contradictions with the checklist, self-competitors and bad source ids cost points", () => {
    const r = makeReport();
    r.meta.siteUrl = "https://acme.test";
    r.audit.seo.checklist = [{ check: "Meta description", status: "pass", detail: "142 chars" }];
    r.audit.messaging = [{ title: "Missing meta description", severity: "high", evidence: "The page has no meta description", recommendation: "Add one" }];
    r.competitors = [{ name: "Acme", url: "https://acme.test", positioning: "", pricing: null, strengths: [], weaknesses: [], gapToExploit: "", threat: "low", sourceIds: ["S9"] }];
    r.sources = [];
    const q = scoreReport(r);
    expect(q.stats.contradictions).toBe(1);
    expect(q.issues.map((i) => i.check)).toEqual(expect.arrayContaining(["contradiction", "competitors", "citations"]));
    expect(q.score).toBeLessThan(80);
  });

  test("a clean report scores high", () => {
    const r = makeReport();
    const q = scoreReport(r);
    expect(q.score).toBeGreaterThanOrEqual(0);
    expect(q.score).toBeLessThanOrEqual(100);
  });
});
