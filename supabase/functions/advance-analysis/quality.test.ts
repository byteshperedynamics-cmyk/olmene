//   deno test --allow-all supabase/functions/advance-analysis/quality.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { checkMarketClaims, claimNumbers, numbersBacked } from "./quality.ts";

Deno.test("claim numbers: drop years and small counts, normalise separators", () => {
  assertEquals(claimNumbers("The market was $4.2B in 2024 and grows 12% a year across 3 regions"), ["4.2", "12"]);
  assertEquals(claimNumbers("Le marché pèse 4,2 milliards"), ["4.2"]);
  assertEquals(claimNumbers("1,200 stores"), ["1200"]);
});

Deno.test("a number must be in a cited source", () => {
  const sources = new Map([["S1", { id: "S1", snippet: "Analysts put the market at $4.2 billion, growing 12% annually." }]]);
  assertEquals(numbersBacked("$4.2B, +12% per year", ["S1"], sources), true);
  assertEquals(numbersBacked("$5.1B", ["S1"], sources), false);
  assertEquals(numbersBacked("$4.2B", [], sources), false);
  assertEquals(numbersBacked("Growing demand from small teams", ["S1"], sources), null);
});

Deno.test("market claims: flags and lowered confidence", () => {
  const { market, checked, unverified } = checkMarketClaims({
    size: { value: "$5.1B (2025)", basis: "x", confidence: "medium", sourceIds: ["S1"] },
    trends: [{ trend: "Grows 12% a year", implication: "", sourceIds: ["S1"] }, { trend: "AI adoption", implication: "", sourceIds: [] }],
  }, [{ id: "S1", snippet: "market at $4.2 billion, growing 12% annually" }]);
  assertEquals(market.size.verified, false);
  assertEquals(market.size.confidence, "low");
  assertEquals(market.trends![0].verified, true);
  assertEquals(market.trends![1].verified, undefined);
  assertEquals([checked, unverified], [2, 1]);
});
