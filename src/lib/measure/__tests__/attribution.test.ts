import { describe, expect, test } from "bun:test";
import { groupMerges, measureAll, regIncBeta, welchPValue, type DailyPoint } from "../attribution";

const START = "2026-07-01";
const day = (i: number) => new Date(Date.parse(START + "T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);

/** Deterministic series: base level, optional step after `stepAt`, weekly dip, small noise. */
function series(n: number, base: number, stepAt?: number, step = 0, weekly = 0): DailyPoint[] {
  let seed = 11;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280 - 0.5);
  return Array.from({ length: n }, (_, i) => ({
    date: day(i),
    clicks: Math.round(base + (stepAt !== undefined && i > stepAt ? step : 0) + (i % 7 >= 5 ? -weekly : 0) + rnd() * 10),
  }));
}

describe("statistics", () => {
  test("regularized incomplete beta matches known values", () => {
    expect(regIncBeta(0.5, 1, 1)).toBeCloseTo(0.5, 6);
    expect(regIncBeta(0.3, 2, 3)).toBeCloseTo(0.3483, 4);
  });
  test("Welch p-value: identical samples ≈ 1, clearly different ≈ 0", () => {
    expect(welchPValue([1, 2, 3, 4, 5], [1, 2, 3, 4, 5])).toBeCloseTo(1, 5);
    expect(welchPValue([10, 11, 9, 10, 12, 11, 10], [30, 31, 29, 32, 30, 31, 30])!).toBeLessThan(0.001);
  });
});

describe("attribution", () => {
  test("flat traffic → no meaningful change, low confidence", () => {
    const [o] = measureAll(series(60, 200), [{ id: "pr1", mergedAt: day(30) }], day(59));
    expect(o.status).toBe("measured");
    expect(Math.abs(o.deltaPct!)).toBeLessThan(3);
    expect(o.confidence).toBe("low");
  });

  test("clear step up after the merge → positive delta, high confidence", () => {
    const [o] = measureAll(series(60, 200, 30, 60), [{ id: "pr1", mergedAt: day(30) + "T12:00:00Z" }], day(59));
    expect(o.status).toBe("measured");
    expect(o.deltaPct!).toBeGreaterThan(25);
    expect(o.confidence).toBe("high");
  });

  test("weekly seasonality is matched by 14-day windows (no false lift)", () => {
    const [o] = measureAll(series(60, 200, undefined, 0, 60), [{ id: "pr1", mergedAt: day(30) }], day(59));
    expect(Math.abs(o.deltaPct!)).toBeLessThan(4);
    expect(o.confidence).not.toBe("high");
  });

  test("fewer than 14 post-merge days → early signal", () => {
    const [o] = measureAll(series(40, 200, 30, 60), [{ id: "pr1", mergedAt: day(30) }], day(36));
    expect(o.status).toBe("early");
    expect(o.afterDays).toBe(6);
  });

  test("merges within 7 days are measured together, never split", () => {
    const groups = groupMerges([
      { id: "a", mergedAt: day(30) },
      { id: "b", mergedAt: day(34) },
      { id: "c", mergedAt: day(50) },
    ]);
    expect(groups).toEqual([
      { ids: ["a", "b"], mergeDate: day(30) },
      { ids: ["c"], mergeDate: day(50) },
    ]);
    const out = measureAll(series(80, 200, 30, 50), [{ id: "a", mergedAt: day(30) }, { id: "b", mergedAt: day(34) }], day(79));
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("combined");
  });

  test("not enough history → insufficient, no numbers invented", () => {
    const [o] = measureAll(series(10, 200), [{ id: "pr1", mergedAt: day(3) }], day(9));
    expect(o.status).toBe("insufficient");
    expect(o.deltaPct).toBeNull();
  });
});
