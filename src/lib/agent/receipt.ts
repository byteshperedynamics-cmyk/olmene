/**
 * Receipt builder — the user-facing record of everything the agent did,
 * with undo steps (spec §3.D). Stored in `receipts` and rendered by the UI.
 */

import type { AgentJobRow, PlannedActionRow } from "./runner";

export interface ReceiptContext {
  prUrl: string;
  prNumber: number;
  verified: boolean;
}

export async function buildReceipt(
  job: AgentJobRow,
  actions: PlannedActionRow[],
  ctx: ReceiptContext,
): Promise<string> {
  const date = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const input = job.input as { targetRepo?: string };
  const applied = actions.filter((a) => a.status === "applied");
  const skipped = actions.filter((a) => a.status === "skipped");
  const rejected = actions.filter((a) => a.status === "rejected");

  const lines: string[] = [
    `# Olmene fix receipt`,
    ``,
    `- **Job:** ${job.id}`,
    `- **Date:** ${date}`,
    `- **Repository:** ${input.targetRepo ?? "—"}`,
    `- **Pull request:** [#${ctx.prNumber}](${ctx.prUrl})`,
    `- **Verification:** ${ctx.verified ? "passed — PR is open with the exact commit the agent created" : "FAILED — review the PR manually"}`,
    ``,
    `## What was applied (${applied.length})`,
    ``,
  ];

  if (applied.length === 0) lines.push(`Nothing was applied.`, ``);
  for (const a of applied) {
    const p = a.preview as { explanation?: string; expectedScoreChange?: string } | null;
    lines.push(
      `### ${a.fixer_id}`,
      `- Change: ${p?.explanation ?? "—"}`,
      `- Expected effect: ${p?.expectedScoreChange ?? "—"}`,
      `- Result: pull request #${ctx.prNumber} (nothing merges without your review)`,
      ``,
    );
  }

  if (skipped.length > 0) {
    lines.push(`## Skipped, with reasons (${skipped.length})`, ``);
    for (const a of skipped) {
      lines.push(`- **${a.fixer_id}** — ${a.skip_reason ?? "no reason recorded"}`);
    }
    lines.push(``);
  }
  if (rejected.length > 0) {
    lines.push(
      `## You declined (${rejected.length})`,
      ``,
      ...rejected.map((a) => `- **${a.fixer_id}** — not applied; nothing from this fixer touched your repo`),
      ``,
    );
  }

  lines.push(
    `## How to undo`,
    ``,
    `1. **Before merging:** close pull request #${ctx.prNumber}. Nothing else needed — your default branch was never touched.`,
    `2. **After merging:** click *Revert* on the pull request in GitHub (it opens an inverse pull request), or run \`git revert\` on the merge commit.`,
    ``,
    `## What Olmene could and could not do`,
    ``,
    `- The GitHub App had **Contents: read/write** and **Pull requests: read/write** permission, on this repository only.`,
    `- It could not: push to your default branch, delete branches, force-push, or touch anything outside \`${input.targetRepo ?? "the repo"}\`.`,
    ``,
    `## Ending Olmene access`,
    ``,
    `1. In Olmene: *Agent → Disconnect GitHub* — we delete the connection and verify it is dead.`,
    `2. On GitHub: *Settings → Applications → Installed GitHub Apps → Olmene → Uninstall*.`,
    `3. The app's access tokens expire within **1 hour** of any change; uninstalling kills them immediately.`,
    ``,
    `_Generated automatically by Olmene. Keep this receipt for your records._`,
  );

  return lines.join("\n");
}
