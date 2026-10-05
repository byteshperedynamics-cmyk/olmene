"use client";

import { useState } from "react";
import type { JobState, PlannedAction } from "@/lib/agent-client";
import { JobView } from "@/components/v2/agent/job-view";
import { ThemeToggle } from "@/components/theme-toggle";
import { SAMPLE_DIFF } from "@/lib/v2/sample-data";
import { cn } from "@/lib/utils";

const NOW = "2026-10-01T09:30:00.000Z";

const action = (id: string, fixer: string, i: number, extra: Partial<PlannedAction> = {}): PlannedAction => ({
  id,
  fixer_id: fixer,
  finding_ref: {},
  status: "planned",
  skip_reason: null,
  target: {},
  preview: {
    files: [SAMPLE_DIFF[i].path],
    edits: [{ path: SAMPLE_DIFF[i].path, isNewFile: !!SAMPLE_DIFF[i].isNewFile, diff: SAMPLE_DIFF[i].diff }],
    explanation:
      i === 0
        ? "Replaces the one-word title with a descriptive one and adds a meta description, so search results show what Acme does."
        : "Adds Organization structured data so search engines and AI answers can identify the company behind the site.",
    evidence: i === 0 ? "Homepage <title> is “Acme” (4 characters); no meta description found." : "No JSON-LD found in the rendered homepage.",
    expectedScoreChange: i === 0 ? "+6 readiness (SEO & technical)" : "+4 readiness (trust signals)",
    revertSteps: ["Close the pull request without merging", "Or revert the merge commit on GitHub"],
  },
  apply_result: null,
  created_at: NOW,
  ...extra,
});

const BASE: JobState = {
  job: {
    id: "7f3a9c21-0000-4000-8000-000000000000",
    status: "awaiting_approval",
    current_step: "await_approval",
    input: { targetRepo: "acme/site" },
    step_outputs: {},
    error: null,
    report_id: null,
    created_at: NOW,
    completed_at: null,
  },
  actions: [
    action("a1", "title-tag", 0),
    action("a2", "next-jsonld", 1),
    {
      ...action("a3", "jsx-image-alt", 0),
      status: "skipped",
      preview: null,
      skip_reason: "The hero image src is computed at runtime, so its content can't be described with confidence.",
    },
  ],
  audit: [
    { id: "r1", actor: "agent", action_type: "plan", result: "success", target: null, detail: null, created_at: NOW },
    { id: "r2", actor: "agent", action_type: "preview", result: "success", target: null, detail: null, created_at: NOW },
  ],
};

const STATES: Record<string, JobState> = {
  drafting: { ...BASE, job: { ...BASE.job, status: "previewing", current_step: "preview" }, actions: [] },
  review: BASE,
  applying: { ...BASE, job: { ...BASE.job, status: "applying", current_step: "apply" } },
  completed: {
    ...BASE,
    job: {
      ...BASE.job,
      status: "completed",
      current_step: "done",
      step_outputs: {
        apply: {
          prUrl: "https://github.com/acme/site/pull/14",
          prNumber: 14,
          branch: "olmene/fix-7f3a9c21-a1",
          files: ["app/layout.tsx", "components/olmene-jsonld.tsx"],
        },
      },
    },
    actions: BASE.actions.map((a) => (a.status === "planned" ? { ...a, status: "applied" as const } : a)),
  },
  failed: {
    ...BASE,
    job: { ...BASE.job, status: "failed", current_step: "apply", error: "GitHub rejected the branch push (repository is archived)." },
  },
};

export function AgentRunPreview() {
  const [key, setKey] = useState("review");
  const [checked, setChecked] = useState<Set<string>>(new Set(["a1", "a2"]));
  return (
    <main className="o-grid-bg min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto mb-6 flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {Object.keys(STATES).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKey(k)}
              className={cn(
                "rounded-full border px-3 py-1 font-mono text-xs",
                k === key ? "border-primary bg-leaf-soft text-primary" : "text-muted-foreground",
              )}
            >
              {k}
            </button>
          ))}
        </div>
        <ThemeToggle />
      </div>
      <JobView
        state={STATES[key]}
        checked={checked}
        onToggle={(id) =>
          setChecked((p) => {
            const n = new Set(p);
            if (n.has(id)) n.delete(id);
            else n.add(id);
            return n;
          })
        }
        busy={null}
        onApprove={() => {}}
        onReject={() => {}}
        onCancel={() => {}}
      />
    </main>
  );
}
