// AI search visibility: mention detection, question rules, change alerts.
//   deno test --allow-all supabase/functions/monitor/visibility.test.ts
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { analyzeAnswer, mentions, summarize, validateQuestions, visibilityChange } from "./visibility.ts";

const site = { name: "Acme", host: "acme.io" };
const comps = [{ name: "Globex", url: "https://globex.com" }, { name: "Initech", url: "https://www.initech.com" }];

Deno.test("mentions: brand on word boundaries or the domain", () => {
  assert(mentions("Try Acme or Globex.", "Acme", "acme.io") >= 0);
  assertEquals(mentions("Acmeville is a town.", "Acme", "acme.io"), -1);
  assert(mentions("see acme.io for details", "Zzz", "acme.io") >= 0);
});

Deno.test("analyzeAnswer: mentioned, cited, rank among named brands, competitors", () => {
  const r = analyzeAnswer("best analytics for small teams", {
    text: "Popular picks are Globex and Initech. Acme is a newer option for small teams.",
    sources: [{ uri: "https://vertexaisearch.cloud.google.com/redirect/1", title: "acme.io", domain: null }, { uri: "x", title: "globex.com", domain: "globex.com" }],
  }, site, comps);
  assertEquals(r.mentioned, true);
  assertEquals(r.cited, true);
  assertEquals(r.rank, 3);
  assertEquals(r.competitors.sort(), ["Globex", "Initech"]);
  assert(r.excerpt?.startsWith("Acme is a newer option"));
});

Deno.test("questions never contain the brand and need at least three", () => {
  const ok = validateQuestions({ questions: ["best analytics tool for small teams", "Acme vs Globex", "how to track signups without a data engineer", "cheap product analytics for startups"] }, site, 6);
  assertEquals(ok.length, 3);
  assert(!ok.some((q) => q.includes("Acme")));
  assertThrows(() => validateQuestions({ questions: ["Acme pricing"] }, site, 6));
});

Deno.test("change alerts: big moves and competitors overtaking", () => {
  const r = (mentioned: boolean, competitors: string[]) => ({ question: "q", mentioned, cited: false, rank: null, competitors, sources: [], excerpt: null });
  const prev = summarize([r(true, []), r(true, []), r(true, []), r(false, []), r(false, []), r(false, [])]);
  const next = summarize([r(true, ["Globex"]), r(false, ["Globex"]), r(false, ["Globex"]), r(false, []), r(false, []), r(false, [])]);
  const c = visibilityChange(prev, next, "Acme");
  assert(c.changed);
  assertEquals(c.summary[0], "Acme was mentioned in 1 of 6 answers (last week: 3).");
  assert(c.summary[1].startsWith("Globex is now named in 3 of 6 answers"));
  assertEquals(visibilityChange(null, next, "Acme").changed, false);
});
