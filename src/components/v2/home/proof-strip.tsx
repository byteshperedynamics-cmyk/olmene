"use client";

import { useI18n } from "@/i18n/provider";
import { CountUp } from "../count-up";

export interface ProofStat {
  value: number;
  label: string;
}

/**
 * Real production numbers in an instrument readout. The server renders a real
 * floor (see STATS in app/page.tsx), never "0" or "—"; the live value replaces
 * it, and only the last 15% counts up when the strip scrolls into view.
 */
export function ProofStrip({ stats }: { stats: ProofStat[] }) {
  const { t } = useI18n();
  return (
    <section aria-label={t("stats.label")} className="border-b border-edge">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 px-4 sm:px-6 md:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`grid gap-2 px-2 py-8 md:px-6 md:py-10 ${i % 2 === 1 ? "border-s border-edge" : ""} ${i >= 2 ? "border-t border-edge md:border-t-0" : ""} ${
              i === 2 ? "md:border-s" : ""
            }`}
          >
            <CountUp value={s.value} fromRatio={0.85} duration={1300} className="o-readout-strong text-4xl font-medium text-foreground md:text-[44px]" />
            <p className="max-w-[20ch] text-[13px] leading-snug text-muted-foreground">{t(s.label)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
