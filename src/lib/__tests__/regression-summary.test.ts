import { describe, expect, test } from "bun:test";
import { DataError, queryRegressionSummary } from "@/lib/data";

type RecordRow = { user_id: string; kind: string; created_at: string; id: number };
type Failure = "count" | "latest" | "missing_count";

function fakeDb(rows: RecordRow[], failure?: Failure) {
  const calls: Array<{ owner?: string; kinds?: string[]; since?: string }> = [];
  const db = {
    from(table: string) {
      expect(table).toBe("notifications");
      const call: (typeof calls)[number] = {};
      calls.push(call);
      let head = false;
      let limit = Infinity;
      const query = {
        select(_columns: string, options?: { head?: boolean }) { head = !!options?.head; return query; },
        eq(_column: string, owner: string) { call.owner = owner; return query; },
        in(_column: string, kinds: string[]) { call.kinds = kinds; return query; },
        gte(_column: string, since: string) { call.since = since; return query; },
        order() { return query; },
        limit(value: number) { limit = value; return query; },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          const filtered = rows
            .filter((row) => row.user_id === call.owner && call.kinds?.includes(row.kind) && row.created_at >= (call.since ?? ""))
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          const error = failure === (head ? "count" : "latest") ? { message: "query failed", code: "db_error" } : null;
          return Promise.resolve({ count: head ? (failure === "missing_count" ? null : filtered.length) : null, data: head ? null : filtered.slice(0, limit), error }).then(resolve, reject);
        },
      };
      return query;
    },
  } as unknown as Parameters<typeof queryRegressionSummary>[0];
  return { db, calls };
}

describe("30-day regression summary", () => {
  const since = "2026-09-30T12:00:00.000Z";

  test("counts regressions despite 30 newer activity events and returns the six newest", async () => {
    const unrelated = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, user_id: "agency", kind: "analysis_complete", created_at: `2026-10-${String(i + 1).padStart(2, "0")}T12:00:00.000Z` }));
    const regressions = Array.from({ length: 8 }, (_, i) => ({ id: 100 + i, user_id: "agency", kind: i % 2 ? "site_regression" : "fix_regression", created_at: `2026-10-${String(i + 10).padStart(2, "0")}T12:00:00.000Z` }));
    const { db, calls } = fakeDb([
      ...unrelated,
      ...regressions,
      { id: 200, user_id: "other", kind: "site_regression", created_at: "2026-10-29T12:00:00.000Z" },
      { id: 201, user_id: "agency", kind: "site_regression", created_at: "2026-09-29T12:00:00.000Z" },
    ]);
    const result = await queryRegressionSummary(db, "agency", since);
    expect(result.count).toBe(8);
    expect(result.items.map((row) => row.id)).toEqual([107, 106, 105, 104, 103, 102]);
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.owner === "agency" && call.since === since && call.kinds?.length === 2)).toBe(true);
  });

  for (const failure of ["count", "latest"] as const) {
    test(`surfaces a failed ${failure} read`, async () => {
      const { db } = fakeDb([], failure);
      expect(queryRegressionSummary(db, "agency", since)).rejects.toBeInstanceOf(DataError);
    });
  }

  test("does not present a missing count as zero", async () => {
    const { db } = fakeDb([], "missing_count");
    expect(queryRegressionSummary(db, "agency", since)).rejects.toBeInstanceOf(DataError);
  });
});
