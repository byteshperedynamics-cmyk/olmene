// deno test --allow-all supabase/functions/_shared/client-report.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { canWhiteLabel, emailSafeLogo, nextReportAt, periodPhrase, periodStart, possessive, senderName, summarizeSite } from "./client-report.ts";

// The same cases are in src/lib/agency/__tests__/rules.test.ts: the Worker sets the first slot, the monitor the ones after.
const SCHEDULE: Array<["weekly" | "monthly", string, string]> = [
  ["weekly", "2026-10-15T12:00:00Z", "2026-10-19T08:00:00.000Z"], // Thursday → Monday
  ["weekly", "2026-10-19T07:59:00Z", "2026-10-19T08:00:00.000Z"], // Monday before eight → that morning
  ["weekly", "2026-10-19T08:00:00Z", "2026-10-26T08:00:00.000Z"], // Monday at eight → next week
  ["weekly", "2026-10-18T23:00:00Z", "2026-10-19T08:00:00.000Z"], // Sunday night → Monday
  ["monthly", "2026-10-15T12:00:00Z", "2026-11-01T08:00:00.000Z"],
  ["monthly", "2026-11-01T07:00:00Z", "2026-11-01T08:00:00.000Z"],
  ["monthly", "2026-11-01T08:00:00Z", "2026-12-01T08:00:00.000Z"],
  ["monthly", "2026-12-20T00:00:00Z", "2027-01-01T08:00:00.000Z"],
];

Deno.test("reports go out Mondays or the 1st, at 08:00 UTC, always after now", () => {
  for (const [cadence, from, want] of SCHEDULE) assertEquals(nextReportAt(cadence, new Date(from)).toISOString(), want, `${cadence} from ${from}`);
});

Deno.test("a report covers the week or calendar month before it", () => {
  assertEquals(periodStart("weekly", new Date("2026-10-19T08:00:00Z")).toISOString(), "2026-10-12T08:00:00.000Z");
  assertEquals(periodStart("monthly", new Date("2026-11-01T08:00:00Z")).toISOString(), "2026-10-01T08:00:00.000Z");
  assertEquals(periodPhrase("weekly", new Date("2026-10-12T08:00:00Z")), "this week");
  assertEquals(periodPhrase("monthly", new Date("2026-10-01T08:00:00Z")), "in October");
  // A test sent mid-month doesn't name the wrong month.
  assertEquals(periodPhrase("monthly", new Date("2026-09-15T10:00:00Z")), "this month");
});

Deno.test("sender: the agency, via Olmene unless white-labelled", () => {
  assertEquals(senderName("Northwind Studio", false), "Northwind Studio via Olmene");
  assertEquals(senderName("Northwind Studio", true), "Northwind Studio");
  assertEquals(senderName(null, true), "Olmene");
  assertEquals(canWhiteLabel("team-yearly"), true);
  assertEquals(canWhiteLabel("fix"), false);
});

Deno.test("WebP logos fall back to the name (many mail apps can't show them)", () => {
  assertEquals(emailSafeLogo("https://x.supabase.co/storage/v1/object/public/brand-assets/w/a.png"), "https://x.supabase.co/storage/v1/object/public/brand-assets/w/a.png");
  assertEquals(emailSafeLogo("https://x.supabase.co/storage/v1/object/public/brand-assets/w/a.jpg"), "https://x.supabase.co/storage/v1/object/public/brand-assets/w/a.jpg");
  assertEquals(emailSafeLogo("https://x.supabase.co/storage/v1/object/public/brand-assets/w/a.webp"), null);
  assertEquals(emailSafeLogo(null), null);
});

Deno.test("a site's line: score then and now, checks passing, and what was fixed during the period", () => {
  const site = {
    host: "bakery.example",
    last_score: 81.6,
    last_checklist: [
      { check: "Title tag", status: "pass" },
      { check: "Meta description", status: "pass" },
      { check: "Contact page", status: "fail" },
      { check: "Reviews", status: "warn" },
    ],
  };
  const before = { score: 74, checklist: [{ check: "Title tag", status: "pass" }, { check: "Meta description", status: "fail" }, { check: "Contact page", status: "fail" }] };
  assertEquals(summarizeSite(site, before), { host: "bakery.example", scoreNow: 82, scoreBefore: 74, checksPassing: 2, checksTotal: 4, fixed: 1 });
  // First checked during the period: no "before".
  assertEquals(summarizeSite(site, null), { host: "bakery.example", scoreNow: 82, scoreBefore: null, checksPassing: 2, checksTotal: 4, fixed: 0 });
  // Junk in, nothing invented out.
  assertEquals(summarizeSite({ host: "x.example", last_score: "80", last_checklist: "nope" }, { score: 500, checklist: null }), {
    host: "x.example",
    scoreNow: null,
    scoreBefore: null,
    checksPassing: 0,
    checksTotal: 0,
    fixed: 0,
  });
});

Deno.test("possessives read right", () => {
  assertEquals(possessive("Bakery Co"), "Bakery Co's");
  assertEquals(possessive("Bakery Brothers"), "Bakery Brothers'");
});
