"use client";

import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { scoreDelta, type SiteProgress } from "@/lib/account/progress";
import { ScoreTrend } from "@/components/account/score-trend";

/** Day-month-year in the reader's language (client reports need the year). */
export function useLongDate() {
  const { lang } = useI18n();
  return (iso: string) => {
    try {
      return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : lang, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
    } catch {
      return iso.slice(0, 10);
    }
  };
}

/** When a site was last measured: the newest weekly point, else when watching began. */
export function latestMeasurement(site: SiteProgress): string {
  return site.history[site.history.length - 1]?.at ?? site.since;
}

/**
 * One site as an agency's client reads it (refinement 2026-10-30): a
 * professional record, not a social card. Scope and date first, then the
 * readiness score with its trend, then the checks that pass and the ones
 * that went from failing to passing, and what all of it does and doesn't
 * mean. No achievement badges. Uses only the existing portal data.
 */
export function ClientProgress({ site, compact = false, className }: { site: SiteProgress; compact?: boolean; className?: string }) {
  const { t } = useI18n();
  const long = useLongDate();
  const delta = scoreDelta(site);
  const firstAt = site.history[0]?.at ?? site.since;
  const address = site.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const band = site.scoreNow == null ? null : site.scoreNow >= 75 ? "good" : site.scoreNow >= 50 ? "mid" : "low";
  const trendLabel =
    site.history.length > 1 && site.scoreFirst != null && site.scoreNow != null
      ? t("cp.trendLabel", { from: site.scoreFirst, to: site.scoreNow, date: long(firstAt) })
      : t("cp.firstMeasured", { date: long(firstAt) });

  return (
    <article className={cn("grid content-start gap-5 rounded-xl border bg-card p-5 sm:p-6", compact && "gap-4 p-4 sm:p-5", className)}>
      <header className="grid gap-1">
        <h2 className={cn("font-medium leading-snug", compact ? "text-[15px]" : "text-[17px]")} dir="ltr">
          {site.host}
        </h2>
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
          {address !== site.host && (
            <span className="truncate font-mono text-[12px]" dir="ltr">
              {address}
            </span>
          )}
          <span>{t("cp.measured", { date: long(latestMeasurement(site)) })}</span>
        </p>
      </header>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <p className="text-[13px] text-muted-foreground">{t("cp.score")}</p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className={cn("o-readout-strong leading-none", compact ? "text-[32px]" : "text-[40px]")}>{site.scoreNow ?? "–"}</span>
              <span className="text-[14px] text-muted-foreground">/100</span>
              {band && (
                <span
                  className={cn(
                    "ms-2 inline-flex items-center gap-1.5 text-[13px]",
                    band === "good" ? "text-tel-emerald" : band === "mid" ? "text-tel-amber" : "text-tel-rose",
                  )}
                >
                  <span className="size-1.5 rounded-full bg-current" aria-hidden />
                  {t(`cp.band.${band}`)}
                </span>
              )}
            </p>
          </div>
          {delta != null && site.history.length > 1 && (
            <p className="text-[13.5px] text-muted-foreground">
              {delta > 0
                ? t("cp.up", { n: delta, date: long(firstAt) })
                : delta < 0
                  ? t("cp.down", { n: -delta, date: long(firstAt) })
                  : t("cp.same", { date: long(firstAt) })}
            </p>
          )}
        </div>
        {site.history.length > 1 ? (
          <ScoreTrend history={site.history} height={compact ? 64 : 104} goodLabel={compact ? undefined : t("share.good")} label={trendLabel} />
        ) : (
          <p className="text-[13px] text-muted-foreground">{t("cp.firstMeasured", { date: long(firstAt) })}</p>
        )}
      </div>

      <dl className="grid gap-3 border-t pt-4 sm:grid-cols-2">
        <div className="grid gap-1">
          <dt className="text-[13px] text-muted-foreground">{t("cp.passingLabel")}</dt>
          <dd className="text-[15px]">
            <span className="o-readout-strong">{site.checksPassing}</span>
            <span className="text-muted-foreground"> / {site.checksTotal}</span>
          </dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-[13px] text-muted-foreground">{t("cp.fixedLabel", { date: long(firstAt) })}</dt>
          <dd className="o-readout-strong text-[15px]">{site.checksFixed}</dd>
        </div>
      </dl>
    </article>
  );
}

/** What the numbers measure and what they don't: shown once per client page. */
export function ClientProgressNote({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <div className={cn("grid gap-2 rounded-xl border bg-card/60 p-5 text-[13.5px] leading-relaxed text-muted-foreground", className)}>
      <p>
        <span className="font-medium text-foreground">{t("cp.note.title")}</span> {t("cp.note.measures")}
      </p>
      <p>{t("cp.note.limits")}</p>
      <p>{t("cp.note.engine")}</p>
    </div>
  );
}
