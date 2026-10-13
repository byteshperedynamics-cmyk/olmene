//   deno test --allow-all supabase/functions/_shared/speed.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { parsePsi } from "./speed.ts";

Deno.test("PageSpeed Insights: performance score, LCP, CLS, TBT", () => {
  const s = parsePsi({ lighthouseResult: { categories: { performance: { score: 0.734 } }, audits: { "largest-contentful-paint": { numericValue: 3812.4 }, "cumulative-layout-shift": { numericValue: 0.04567 }, "total-blocking-time": { numericValue: 410.2 } } } });
  assertEquals(s, { source: "pagespeed-lab", performance: 73, lcpMs: 3812, cls: 0.046, tbtMs: 410 });
  assertEquals(parsePsi({}), null);
});
