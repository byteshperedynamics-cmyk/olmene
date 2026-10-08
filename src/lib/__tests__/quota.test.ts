import { describe, expect, test } from "bun:test";
import { quotaWindow } from "../quota";

describe("quotaWindow", () => {
  test("monthly plans count over the billing period", () => {
    const w = quotaWindow("2026-10-03T10:00:00.000Z", "2026-11-03T10:00:00.000Z", "month", new Date("2026-10-20T00:00:00Z"));
    expect(w).toEqual({ start: "2026-10-03T10:00:00.000Z", end: "2026-11-03T10:00:00.000Z" });
  });

  test("yearly plans count per month, from the subscription's day of the month", () => {
    const w = quotaWindow("2026-01-15T09:30:00.000Z", "2027-01-15T09:30:00.000Z", "year", new Date("2026-05-20T12:00:00Z"));
    expect(w).toEqual({ start: "2026-05-15T09:30:00.000Z", end: "2026-06-15T09:30:00.000Z" });
  });

  test("before this month's anniversary, the window is last month's", () => {
    const w = quotaWindow("2026-01-15T09:30:00.000Z", "2027-01-15T09:30:00.000Z", "year", new Date("2026-05-10T00:00:00Z"));
    expect(w.start).toBe("2026-04-15T09:30:00.000Z");
    expect(w.end).toBe("2026-05-15T09:30:00.000Z");
  });

  test("the first month of a yearly plan starts at the period start", () => {
    const w = quotaWindow("2026-10-07T06:00:00.000Z", "2027-10-07T06:00:00.000Z", "year", new Date("2026-10-08T00:00:00Z"));
    expect(w).toEqual({ start: "2026-10-07T06:00:00.000Z", end: "2026-11-07T06:00:00.000Z" });
  });

  test("month-end starts clamp to shorter months", () => {
    const w = quotaWindow("2026-01-31T00:00:00.000Z", "2027-01-31T00:00:00.000Z", "year", new Date("2026-03-05T00:00:00Z"));
    expect(w).toEqual({ start: "2026-02-28T00:00:00.000Z", end: "2026-03-31T00:00:00.000Z" });
  });

  test("the last monthly window never runs past the yearly period end", () => {
    const w = quotaWindow("2026-01-31T00:00:00.000Z", "2027-01-30T00:00:00.000Z", "year", new Date("2027-01-10T00:00:00Z"));
    expect(w).toEqual({ start: "2026-12-31T00:00:00.000Z", end: "2027-01-30T00:00:00.000Z" });
  });

  test("a yearly plan gives 12 separate monthly windows across the year", () => {
    const starts = new Set<string>();
    for (let d = 0; d < 365; d += 3) {
      const now = new Date(Date.UTC(2026, 0, 15, 12) + d * 86_400_000);
      starts.add(quotaWindow("2026-01-15T00:00:00.000Z", "2027-01-15T00:00:00.000Z", "year", now).start);
    }
    expect(starts.size).toBe(12);
  });
});
