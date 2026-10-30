import { expect, test } from "bun:test";
import { countVerifiedRuns } from "@/components/v2/agent/fixers";

test("a run with five verified fixes counts as one verified run", () => {
  expect(countVerifiedRuns([
    { pr_state: "merged", pr_number: 12, step_outputs: { liveCheck: { last: { passed: 5, total: 5 } } } },
    { pr_state: "merged", pr_number: 13, step_outputs: { liveCheck: { last: { passed: 2, total: 3 } } } },
    { pr_state: "open", pr_number: 14 },
  ])).toBe(1);
});
