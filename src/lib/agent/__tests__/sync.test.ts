import { describe, expect, test } from "bun:test";
import type { GhPull, ScopedGithubClient } from "../github/client";
import type { AgentJobRow, AuditEntryInput, GithubPort } from "../runner";
import { safeEqual, syncPullStates, type SyncDbPort } from "../sync";

function job(id: string, pr: number): AgentJobRow {
  return {
    id,
    user_id: "u1",
    report_id: "r1",
    connection_id: "c1",
    provider: "github",
    status: "completed",
    current_step: "done",
    input: { targetRepo: "octocat/site" },
    step_outputs: {},
    error: null,
    wait_reason: null,
    locked_until: null,
    attempts: 0,
    pr_number: pr,
    pr_state: "open",
  };
}

function setup(pulls: Record<number, Partial<GhPull> | Error>) {
  const jobs = [job("j1", 1), job("j2", 2), job("j3", 3)];
  const updates: Array<[string, Partial<AgentJobRow>]> = [];
  const audits: AuditEntryInput[] = [];
  const db: SyncDbPort = {
    listOpenPrJobs: async () => jobs,
    updateJob: async (id, patch) => void updates.push([id, patch]),
    audit: async (e) => void audits.push(e),
  };
  const gh: GithubPort = {
    client: async (j) =>
      ({
        getPull: async (n: number) => {
          const p = pulls[n];
          if (p instanceof Error) throw p;
          return { number: n, html_url: "", state: "open", head: { ref: "", sha: "" }, base: { ref: "main" }, title: "", ...p };
        },
        _job: j,
      }) as unknown as ScopedGithubClient,
  };
  return { db, gh, updates, audits };
}

describe("PR merge tracking", () => {
  test("merged, closed and still-open PRs are recorded correctly", async () => {
    const { db, gh, updates, audits } = setup({
      1: { state: "closed", merged_at: "2026-10-02T10:00:00Z" },
      2: { state: "closed", merged_at: null },
      3: { state: "open" },
    });
    const r = await syncPullStates(db, gh, { now: () => new Date("2026-10-03T00:00:00Z") });
    expect(r).toEqual({ checked: 3, merged: 1, closed: 1, errors: 0 });
    expect(updates[0]).toEqual(["j1", { pr_state: "merged", merged_at: "2026-10-02T10:00:00Z", pr_last_polled_at: "2026-10-03T00:00:00.000Z" }]);
    expect(updates[1][1].pr_state).toBe("closed");
    expect(updates[2][1]).toEqual({ pr_last_polled_at: "2026-10-03T00:00:00.000Z" });
    expect(audits.map((a) => a.action_type)).toEqual(["pr_merged", "pr_closed"]);
  });

  test("one failing repo does not stop the others", async () => {
    const { db, gh, updates } = setup({ 1: new Error("revoked"), 2: { state: "closed", merged_at: "2026-10-02T00:00:00Z" }, 3: {} });
    const r = await syncPullStates(db, gh);
    expect(r.errors).toBe(1);
    expect(r.merged).toBe(1);
    expect(updates.find(([id]) => id === "j1")?.[1].pr_state).toBeUndefined();
  });

  test("safeEqual", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});
