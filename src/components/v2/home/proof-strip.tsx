"use client";

import { useI18n } from "@/i18n/provider";
import { CountUp } from "../count-up";

export interface ProofStat {
  /** null until the live number arrives: a dash, never a hardcoded guess. */
  value: number | null;
  label: string;
}

/** Real production numbers. Never inflated; see STATS in app/page.tsx. */
export function ProofStrip({ stats }: { stats: ProofStat[] }) {
  const { t } = useI18n();
  return (
    <section aria-label={t("stats.label")} className="border-b bg-card/40">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 px-4 sm:px-6 md:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`grid gap-1.5 px-2 py-8 md:px-6 md:py-10 ${i % 2 === 1 ? "border-s" : ""} ${i >= 2 ? "border-t md:border-t-0" : ""} ${
              i === 2 ? "md:border-s" : ""
            }`}
          >
            {s.value === null ? (
              <span aria-hidden className="font-display text-4xl font-medium tracking-tight text-muted-foreground/60 md:text-5xl">
                —
              </span>
            ) : (
              <CountUp value={s.value} className="font-display text-4xl font-medium tracking-tight md:text-5xl" />
            )}
            <p className="max-w-[18ch] text-[13px] leading-snug text-muted-foreground">{t(s.label)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
