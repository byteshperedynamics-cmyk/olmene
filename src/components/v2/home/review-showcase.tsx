"use client";

import { Check, CheckCircle2 } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { SAMPLE_DIFF } from "@/lib/v2/sample-data";
import { ExampleBadge, LivePill, ProductFrame } from "../atoms";
import { DiffView } from "../diff-view";
import { Flower } from "../flower";
import { InView } from "../in-view";
import { StepRail, type RailStep } from "../step-rail";
import { Section, SectionHeader } from "./section";

/**
 * The agent's review screen, rendered with the real v2 components and a fixed
 * EXAMPLE job (marked as such). Controls are illustrative, not interactive.
 */
export function ReviewShowcase() {
  const { t } = useI18n();
  const steps: RailStep[] = [
    { key: "plan", label: t("agent.step.plan"), state: "done", meta: "0:11" },
    { key: "draft", label: t("agent.step.draft"), state: "done", meta: "0:38" },
    { key: "review", label: t("agent.step.review"), state: "now" },
    { key: "pr", label: t("agent.step.pr"), state: "pending" },
    { key: "verify", label: t("agent.step.verify"), state: "pending" },
  ];
  const changes = [
    { label: t("review.c1"), impact: "high" as const },
    { label: t("review.c2"), impact: "high" as const },
  ];

  return (
    <Section className="border-y bg-card/30" innerClassName="grid gap-12">
      <div className="grid min-w-0 gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
        <SectionHeader eyebrow={t("review.label")} title={t("review.title")} lede={t("review.body")} />
        <ul className="grid gap-3 text-[15px] lg:pb-1">
          {["review.li1", "review.li2", "review.li3"].map((k) => (
            <li key={k} className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>{t(k)}</span>
            </li>
          ))}
        </ul>
      </div>

      <InView className="min-w-0">
        <ProductFrame url="olmene.com/app/agent/job/7f3a" badge={<ExampleBadge label={t("common.example")} />}>
          <div className="grid gap-4 p-4 sm:p-6 md:grid-cols-[230px_minmax(0,1fr)]" aria-hidden>
            <div className="min-w-0 rounded-xl border bg-card p-4">
              <div className="mb-3 flex items-center gap-2.5 border-b pb-3">
                <Flower size={24} variant="breathe" />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{t("review.status")}</p>
                  <p className="truncate font-mono text-[10.5px] text-muted-foreground" dir="ltr">
                    acme/site · main
                  </p>
                </div>
              </div>
              <StepRail steps={steps} className="hidden md:grid" />
              <StepRail steps={steps} orientation="horizontal" className="md:hidden" />
            </div>

            <div className="grid min-w-0 gap-3">
              <DiffView files={SAMPLE_DIFF} newFileLabel={t("diff.newFile")} />
              <div className="overflow-hidden rounded-xl border bg-card">
                {changes.map((c) => (
                  <div key={c.label} className="flex items-center gap-2.5 border-b px-3.5 py-2.5 text-[13px] last:border-b-0">
                    <span className="grid size-4 shrink-0 place-items-center rounded bg-primary text-primary-foreground">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    <span className="min-w-0 flex-1 leading-snug">{c.label}</span>
                    <LivePill tone={c.impact === "high" ? "problem" : "neutral"}>
                      {t(c.impact === "high" ? "review.impact.high" : "review.impact.medium")}
                    </LivePill>
                  </div>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-background/40 px-3.5 py-3">
                  <p className="min-w-0 text-[12px] text-muted-foreground">
                    {t("review.branchNote", { branch: "olmene/fix-7f3a" })}
                  </p>
                  <div className="flex gap-2">
                    <span className="inline-flex h-8 items-center rounded-lg border border-line-strong px-3 text-[12.5px]">
                      {t("review.decline")}
                    </span>
                    <span className="o-sheen inline-flex h-8 items-center rounded-lg bg-primary px-3 text-[12.5px] font-medium text-primary-foreground">
                      {t("review.approve", { n: changes.length })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ProductFrame>
      </InView>
    </Section>
  );
}
