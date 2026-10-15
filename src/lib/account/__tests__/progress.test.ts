import { describe, expect, test } from "bun:test";
import {
  accountMilestones,
  checklistProgress,
  cleanDisplayName,
  firstName,
  initials,
  isShareSlug,
  newShareSlug,
  nextMilestone,
  scoreDelta,
  shapeHistory,
  siteMilestones,
  weeksWatched,
  type SiteProgress,
} from "../progress";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

function site(over: Partial<SiteProgress> = {}): SiteProgress {
  return {
    siteId: "s1",
    host: "example.com",
    url: "https://example.com/",
    since: daysAgo(10),
    monitor: true,
    scoreNow: null,
    scoreFirst: null,
    history: [],
    checksPassing: 0,
    checksTotal: 0,
    checksFixed: 0,
    aiMentionShare: null,
    ...over,
  };
}

describe("shapeHistory", () => {
  test("sorts oldest first, drops bad rows, rounds", () => {
    const out = shapeHistory([
      { created_at: daysAgo(1), score: 71.6 },
      { created_at: daysAgo(14), score: 54 },
      { created_at: daysAgo(7), score: null },
      { created_at: "not a date", score: 60 },
      { created_at: daysAgo(3), score: 140 },
    ]);
    expect(out.map((h) => h.score)).toEqual([54, 72]);
  });

  test("keeps the most recent 26 points", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ created_at: daysAgo(40 - i), score: i }));
    const out = shapeHistory(rows);
    expect(out).toHaveLength(26);
    expect(out[0].score).toBe(14);
    expect(out[25].score).toBe(39);
  });
});

describe("checklistProgress", () => {
  test("counts passing, total and checks fixed since the first scan", () => {
    const first = [
      { check: "Title tag", status: "pass" },
      { check: "Meta description", status: "fail" },
      { check: "Open Graph tags", status: "warn" },
    ];
    const latest = [
      { check: "Title tag", status: "pass" },
      { check: "Meta description", status: "pass" },
      { check: "Open Graph tags", status: "pass" },
      { check: "Structured data (JSON-LD)", status: "pass" },
      { check: "Single H1", status: "fail" },
    ];
    expect(checklistProgress(latest, first)).toEqual({ passing: 4, total: 5, fixed: 2 });
  });

  test("tolerates missing or malformed lists", () => {
    expect(checklistProgress(null, undefined)).toEqual({ passing: 0, total: 0, fixed: 0 });
    expect(checklistProgress([{ nope: 1 }], "x")).toEqual({ passing: 0, total: 0, fixed: 0 });
  });
});

describe("siteMilestones", () => {
  test("a brand-new site has none", () => {
    expect(siteMilestones(site(), NOW)).toEqual([]);
  });

  test("a site that climbed from 48 to 79 over five weeks", () => {
    const p = site({
      since: daysAgo(36),
      scoreFirst: 48,
      scoreNow: 79,
      history: [
        { at: daysAgo(35), score: 48 },
        { at: daysAgo(1), score: 79 },
      ],
      checksPassing: 18,
      checksTotal: 21,
      aiMentionShare: 0.2,
    });
    expect(siteMilestones(p, NOW)).toEqual(["first_scan", "score_50", "up_10", "score_75", "weeks_4", "ai_mention", "up_25"]);
  });

  test("weeks only count while the site is watched", () => {
    expect(siteMilestones(site({ since: daysAgo(100), monitor: false }), NOW)).not.toContain("weeks_4");
  });

  test("all checks passing", () => {
    expect(siteMilestones(site({ checksPassing: 21, checksTotal: 21 }), NOW)).toContain("all_checks");
  });
});

describe("account milestones", () => {
  test("a new account: joined only, next is the profile", () => {
    const list = accountMilestones({ createdAt: daysAgo(0), hasName: false, hasPhoto: false, reports: 0, sites: [], fixesShipped: 0, shares: 0 }, NOW);
    expect(list.filter((m) => m.earned).map((m) => m.id)).toEqual(["joined"]);
    expect(nextMilestone(list)).toBe("profile");
  });

  test("every milestone earned leaves nothing next", () => {
    const s = site({ since: daysAgo(40), scoreFirst: 50, scoreNow: 80, history: [{ at: daysAgo(39), score: 50 }], aiMentionShare: 0.1 });
    const list = accountMilestones({ createdAt: daysAgo(40), hasName: true, hasPhoto: true, reports: 2, sites: [s], fixesShipped: 3, shares: 1 }, NOW);
    expect(list.every((m) => m.earned)).toBe(true);
    expect(nextMilestone(list)).toBeNull();
  });
});

describe("helpers", () => {
  test("scoreDelta and weeksWatched", () => {
    expect(scoreDelta({ scoreNow: 80, scoreFirst: 61 })).toBe(19);
    expect(scoreDelta({ scoreNow: 80, scoreFirst: null })).toBeNull();
    expect(weeksWatched(daysAgo(15), NOW)).toBe(2);
    expect(weeksWatched("garbage", NOW)).toBe(0);
  });

  test("cleanDisplayName", () => {
    expect(cleanDisplayName("  Ada   Lovelace \n")).toBe("Ada Lovelace");
    expect(cleanDisplayName("‮evil")).toBe("evil");
    expect(cleanDisplayName("   ")).toBeNull();
    expect(cleanDisplayName(42)).toBeNull();
    expect([...(cleanDisplayName("ä".repeat(80)) ?? "")]).toHaveLength(60);
  });

  test("firstName and initials", () => {
    expect(firstName("Ada Lovelace", "x@y.z")).toBe("Ada");
    expect(firstName(null, "grace.hopper@navy.mil")).toBe("Grace");
    expect(firstName(null, null)).toBeNull();
    expect(initials("Ada Lovelace", null)).toBe("AL");
    expect(initials("Ἀριστοτέλης", null)).toBe("Ἀ");
    expect(initials(null, "grace@navy.mil")).toBe("G");
    expect(initials(null, null)).toBe("?");
  });

  test("share slugs", () => {
    const s = newShareSlug();
    expect(isShareSlug(s)).toBe(true);
    expect(s).not.toMatch(/[l01]/);
    expect(isShareSlug("ABCDEFGHIJ")).toBe(false);
    expect(isShareSlug("abc")).toBe(false);
  });
});
