import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordOpsEvent } from "../ops";

function fakeDb(insert: (row: Record<string, unknown>) => Promise<unknown>) {
  return { from: () => ({ insert }) } as unknown as SupabaseClient;
}

describe("recordOpsEvent", () => {
  test("writes source, severity, message and redacted detail", async () => {
    const rows: Record<string, unknown>[] = [];
    await recordOpsEvent(
      fakeDb(async (row) => rows.push(row)),
      "github-connect",
      "GitHub connect callback failed",
      { detail: "installation listing failed: 403", token: "ghs_abcdefghijklmnopqrstuvwxyz0123456789" },
      "warn",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("github-connect");
    expect(rows[0].severity).toBe("warn");
    expect(JSON.stringify(rows[0].detail)).not.toContain("ghs_abcdefghijklmnopqrstuvwxyz0123456789");
  });

  test("a failing insert never throws", async () => {
    const db = fakeDb(async () => {
      throw new Error("db down");
    });
    expect(recordOpsEvent(db, "cron-sync", "cron sync failed")).resolves.toBeUndefined();
  });
});
