import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanTrialRequest, looksAutomated, TrialInputError } from "../rules";
import { PER_IP_PER_HOUR, submitTrialRequest, TrialRateLimited } from "../server";

const ok = { name: "  Ana   Lima ", email: " Ana@Northwind.Example ", company: "Northwind Studio", website: "northwind.example", kind: "agency" };

function refused(raw: Record<string, unknown>): TrialInputError {
  try {
    cleanTrialRequest(raw);
  } catch (e) {
    if (e instanceof TrialInputError) return e;
    throw e;
  }
  throw new Error("expected a TrialInputError");
}

describe("the trial form", () => {
  test("trims, lower-cases the email and accepts a site as people type it", () => {
    expect(cleanTrialRequest({ ...ok, teamSize: "6-20", note: "  Twelve clients.  " })).toEqual({
      name: "Ana Lima",
      email: "ana@northwind.example",
      company: "Northwind Studio",
      website: "https://northwind.example/",
      kind: "agency",
      teamSize: "6-20",
      note: "Twelve clients.",
    });
    expect(cleanTrialRequest({ ...ok, teamSize: "", note: "" })).toMatchObject({ teamSize: null, note: null });
  });

  test("names the field to fix", () => {
    expect(refused({ ...ok, name: " " }).field).toBe("name");
    expect(refused({ ...ok, email: "ana@northwind" }).field).toBe("email");
    expect(refused({ ...ok, company: "" }).field).toBe("company");
    expect(refused({ ...ok, website: "not a site" }).field).toBe("website");
    expect(refused({ ...ok, website: "javascript:alert(1)" }).field).toBe("website");
    expect(refused({ ...ok, kind: "reseller" }).field).toBe("kind");
    expect(refused({ ...ok, teamSize: "500" }).field).toBe("teamSize");
    expect(refused({ ...ok, note: "x".repeat(1001) }).field).toBe("note");
  });

  test("bots: the hidden field filled, or sent within 3 seconds of the form appearing", () => {
    expect(looksAutomated({ ...ok, hp: "", elapsedMs: 12_000 })).toBe(false);
    expect(looksAutomated({ ...ok, hp: "http://spam", elapsedMs: 12_000 })).toBe(true);
    expect(looksAutomated({ ...ok, elapsedMs: 800 })).toBe(true);
    expect(looksAutomated({ ...ok })).toBe(true);
  });
});

/** Just enough of supabase-js for submitTrialRequest: counts and inserts on one table. */
function fakeDb(rows: Record<string, unknown>[] = []) {
  const db = {
    rows,
    from() {
      const filters: [string, string, unknown][] = [];
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => (filters.push(["eq", k, v]), q),
        gte: (k: string, v: unknown) => (filters.push(["gte", k, v]), q),
        then: (resolve: (r: { count: number }) => void) =>
          resolve({
            count: db.rows.filter((r) => filters.every(([op, k, v]) => (op === "eq" ? r[k] === v : String(r[k]) >= String(v)))).length,
          }),
        insert: async (row: Record<string, unknown>) => {
          db.rows.push({ ...row, created_at: new Date(NOW).toISOString() });
          return { error: null };
        },
      };
      return q;
    },
  };
  return db;
}

const NOW = Date.parse("2026-10-16T10:00:00Z");
const input = cleanTrialRequest(ok);
const ctx = { ip: "203.0.113.7", userId: null, language: "en", notifyTo: "inbox@olmene.example", now: NOW };

describe("storing a request", () => {
  test("stores it with a hashed address and where to email it, never the address itself", async () => {
    const db = fakeDb();
    expect(await submitTrialRequest(db as unknown as SupabaseClient, input, ctx)).toBe("created");
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ email: "ana@northwind.example", kind: "agency", notify_to: "inbox@olmene.example", language: "en" });
    expect(String(db.rows[0].ip_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(db.rows[0])).not.toContain("203.0.113.7");
  });

  test("the same address again within a day is a duplicate, not a second request", async () => {
    const db = fakeDb();
    await submitTrialRequest(db as unknown as SupabaseClient, input, ctx);
    expect(await submitTrialRequest(db as unknown as SupabaseClient, input, { ...ctx, ip: "198.51.100.1" })).toBe("duplicate");
    expect(db.rows).toHaveLength(1);
  });

  test(`one network gets ${PER_IP_PER_HOUR} an hour`, async () => {
    const db = fakeDb();
    for (let i = 0; i < PER_IP_PER_HOUR; i++) {
      await submitTrialRequest(db as unknown as SupabaseClient, { ...input, email: `p${i}@northwind.example` }, ctx);
    }
    await expect(submitTrialRequest(db as unknown as SupabaseClient, { ...input, email: "late@northwind.example" }, ctx)).rejects.toBeInstanceOf(TrialRateLimited);
  });
});
