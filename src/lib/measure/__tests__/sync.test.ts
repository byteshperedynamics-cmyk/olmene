import { describe, expect, test } from "bun:test";
import type { Outcome } from "../attribution";
import { syncMeasure, type MeasureDbPort } from "../sync";

function fakeFetch(handlers: { token?: () => Response; query?: (body: { startDate: string; endDate: string }) => Response }) {
  const calls: string[] = [];
  const f = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("oauth2.googleapis.com/token")) return handlers.token?.() ?? Response.json({ access_token: "ya29.test" });
    if (u.includes("searchAnalytics/query")) return handlers.query!(JSON.parse(String(init?.body)));
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

function memoryDb() {
  const daily: Array<{ date: string; clicks: number }> = [];
  const state = { outcomes: [] as Outcome[], marks: [] as Array<Record<string, unknown>> };
  const db: MeasureDbPort = {
    listGoogleConnections: async () => [{ id: "c1", user_id: "u1", secret_ciphertext: "enc", metadata: { property: "sc-domain:acme.com" } }],
    lastFetchedDate: async () => (daily.length ? daily[daily.length - 1].date : null),
    upsertDaily: async (rows) => void daily.push(...rows.map((r) => ({ date: r.date, clicks: r.clicks }))),
    getDaily: async () => daily,
    mergedJobs: async () => [{ id: "job-1", merged_at: "2026-09-01T10:00:00Z" }],
    replaceOutcomes: async (_c, _u, o) => void (state.outcomes = o),
    markConnection: async (_id, patch) => void state.marks.push(patch),
  };
  return { db, daily, state };
}

describe("measure sync", () => {
  test("fetches final days (today−3), stores them and recomputes outcomes", async () => {
    const { db, daily, state } = memoryDb();
    let asked: { startDate: string; endDate: string } | null = null;
    const { f } = fakeFetch({
      query: (body) => {
        asked = body;
        const rows = [];
        for (let d = Date.parse(body.startDate); d <= Date.parse(body.endDate); d += 86_400_000) {
          const date = new Date(d).toISOString().slice(0, 10);
          rows.push({ keys: [date], clicks: date > "2026-09-01" ? 300 : 200, impressions: 4000, ctr: 0.05, position: 8 });
        }
        return Response.json({ rows });
      },
    });
    const r = await syncMeasure(db, { client: { id: "id", secret: "s" }, decrypt: async () => "1//refresh", fetch: f, today: () => "2026-10-01" });
    expect(asked!.endDate).toBe("2026-09-28");
    expect(asked!.startDate).toBe("2026-06-03");
    expect(r.daysStored).toBe(daily.length);
    expect(state.outcomes).toHaveLength(1);
    expect(state.outcomes[0].status).toBe("measured");
    expect(state.outcomes[0].deltaPct!).toBeGreaterThan(40);
  });

  test("a revoked grant marks the connection expired instead of failing the run", async () => {
    const { db, state } = memoryDb();
    const { f } = fakeFetch({ token: () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }) });
    const r = await syncMeasure(db, { client: { id: "id", secret: "s" }, decrypt: async () => "1//refresh", fetch: f, today: () => "2026-10-01" });
    expect(r.errors).toBe(1);
    expect(state.marks).toContainEqual({ status: "expired" });
  });
});
