// deno test --allow-all supabase/functions/monitor/logic.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { competitorChanges, isoWeek, privateIp, publicUrl, regressions, snapshotOf } from "./logic.ts";

Deno.test("regressions: only drops count; unmeasured content never does", () => {
  const prev = [
    { check: "Title tag", status: "pass" as const },
    { check: "Call-to-action", status: "pass" as const },
    { check: "Trust signals", status: "warn" as const },
    { check: "Content depth", status: "pass" as const },
  ];
  const next = [
    { check: "Title tag", status: "fail" as const },
    { check: "Call-to-action", status: "pass" as const },
    { check: "Trust signals", status: "pass" as const },
    { check: "Content depth", status: "warn" as const, detail: "Not measured: the page is built with JavaScript" },
  ];
  assertEquals(regressions(prev, next), [{ check: "Title tag", before: "pass", after: "fail" }]);
  assertEquals(regressions(null, next), []);
});

Deno.test("competitor snapshots: headline and price changes are reported, first sight is silent", async () => {
  const a = await snapshotOf("<title>Fathom</title><h1>Simple analytics</h1><p>From $14/mo</p>");
  const b = await snapshotOf("<title>Fathom</title><h1>Privacy-first analytics</h1><p>From $15/mo</p>");
  assertEquals(competitorChanges(null, a), []);
  const changes = competitorChanges(a, b);
  assert(changes[0].startsWith("New headline"));
  assert(changes.some((c) => c.includes("$15")));
  assertEquals(competitorChanges(a, await snapshotOf("<title>Fathom</title><h1>Simple analytics</h1><p>From $14/mo</p>")), []);
});

Deno.test("ISO weeks", () => {
  assertEquals(isoWeek(new Date("2026-10-13T12:00:00Z")), "2026-W42");
  assertEquals(isoWeek(new Date("2027-01-01T12:00:00Z")), "2026-W53");
});

Deno.test("only public hosts are fetched", () => {
  assert(publicUrl("https://plausible.io/"));
  assertEquals(publicUrl("http://localhost:3000/"), null);
  assertEquals(publicUrl("http://10.0.0.5/"), null);
  assertEquals(publicUrl("https://intranet.corp/"), null);
  assertEquals(publicUrl("ftp://x.test/"), null);
  assert(privateIp("192.168.1.10"));
  assert(!privateIp("93.184.216.34"));
});
