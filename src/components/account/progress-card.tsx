"use client";

import { Award, BadgeCheck, Bot, CalendarCheck, CalendarClock, Gauge, Sparkles, Target, TrendingUp, Trophy } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { initials as initialsOf, scoreDelta, siteMilestones, weeksWatched, type SiteMilestone, type SiteProgress } from "@/lib/account/progress";
import { ScoreTrend } from "./score-trend";
import { UserAvatar } from "./user-avatar";

const MILESTONE_ICON: Record<SiteMilestone, typeof Award> = {
  first_scan: Gauge,
  score_50: Target,
  up_10: TrendingUp,
  score_75: BadgeCheck,
  weeks_4: CalendarCheck,
  ai_mention: Bot,
  up_25: Sparkles,
  score_90: Trophy,
  all_checks: Award,
  weeks_12: CalendarClock,
};

function useShortDate() {
  const { lang } = useI18n();
  return (iso: string) => {
    try {
      return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : lang, { day: "numeric", month: "short" }).format(new Date(iso));
    } catch {
      return iso.slice(0, 10);
    }
  };
}

/**
 * A site's progress as friends see it: who is improving what, the score and
 * how far it moved, the weekly line, three numbers and the milestones
 * reached. Shared by the public page (/p/[slug]/) and the preview in the
 * share dialog (`compact`).
 */
export function ProgressCard({
  site,
  owner,
  compact = false,
  title,
  className,
}: {
  site: SiteProgress;
  owner: { name: string | null; avatarUrl: string | null };
  compact?: boolean;
  /** Replaces "{name} is improving {host}" (client pages title each card by its site). */
  title?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const short = useShortDate();
  const delta = scoreDelta(site);
  const firstAt = site.history[0]?.at ?? site.since;
  const weeks = weeksWatched(site.since);
  const earned = siteMilestones(site);
  const named = !!owner.name;
  const address = site.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const tone = site.scoreNow == null ? "" : site.scoreNow >= 75 ? "text-tel-emerald" : site.scoreNow >= 50 ? "text-tel-amber" : "text-tel-rose";

  const trendLabel =
    site.history.length > 1 && site.scoreFirst != null && site.scoreNow != null
      ? t("share.trendLabel", { from: site.scoreFirst, to: site.scoreNow, n: Math.max(1, weeks) })
      : t("share.firstCheck", { date: short(firstAt) });

  return (
    <article className={cn("o-artifact grid gap-6 rounded-2xl p-5 sm:p-7", compact && "gap-4 p-4 sm:p-5", className)}>
      <header className="flex items-center gap-3.5">
        {(named || owner.avatarUrl) && (
          <UserAvatar src={owner.avatarUrl} initials={initialsOf(owner.name, site.host)} size={compact ? 36 : 48} />
        )}
        <div className="min-w-0">
          <p className={cn("text-balance font-medium leading-snug", compact ? "text-[15px]" : "text-[18px] sm:text-[20px]")}>
            {title ?? (named ? t("share.title.named", { name: owner.name!, host: site.host }) : t("share.title.anon", { host: site.host }))}
          </p>
          {address !== title && (
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground" dir="ltr">
              {address}
            </p>
          )}
        </div>
      </header>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <p className="text-[13px] text-muted-foreground">{t("share.score")}</p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className={cn("o-readout-strong leading-none tabular-nums", compact ? "text-[40px]" : "text-[56px] sm:text-[64px]", tone)}>
                {site.scoreNow ?? "–"}
              </span>
              <span className="text-[15px] text-muted-foreground">/100</span>
            </p>
          </div>
          {delta != null && site.history.length > 1 && (
            <p
              className={cn(
                "rounded-full border px-3 py-1 text-[13px] font-medium",
                delta > 0 ? "border-tel-emerald/35 bg-tel-emerald/10 text-tel-emerald" : delta < 0 ? "border-tel-rose/35 bg-tel-rose/10 text-tel-rose" : "border-rim bg-chip text-muted-foreground",
              )}
            >
              {delta > 0
                ? t("share.up", { n: delta, date: short(firstAt) })
                : delta < 0
                  ? t("share.down", { n: -delta, date: short(firstAt) })
                  : t("share.same", { date: short(firstAt) })}
            </p>
          )}
        </div>
        <ScoreTrend history={site.history} height={compact ? 72 : 132} goodLabel={compact ? undefined : t("share.good")} label={trendLabel} />
        {site.history.length < 2 && <p className="text-[13px] text-muted-foreground">{t("share.firstCheck", { date: short(firstAt) })}</p>}
      </div>

      <dl className={cn("grid grid-cols-3 gap-3 border-t border-edge pt-5", compact && "pt-4")}>
        <div className="grid gap-1">
          <dt className="order-2 text-[12.5px] leading-snug text-muted-foreground">{t("share.stat.checks", { n: site.checksTotal })}</dt>
          <dd className="o-readout-strong text-[22px] leading-none tabular-nums">
            {site.checksPassing}
            <span className="text-[14px] text-muted-foreground">/{site.checksTotal}</span>
          </dd>
        </div>
        <div className="grid gap-1">
          <dt className="order-2 text-[12.5px] leading-snug text-muted-foreground">{t("share.stat.fixed", { n: site.checksFixed })}</dt>
          <dd className="o-readout-strong text-[22px] leading-none tabular-nums">{site.checksFixed}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="order-2 text-[12.5px] leading-snug text-muted-foreground">{t("share.stat.weeks", { n: weeks })}</dt>
          <dd className="o-readout-strong text-[22px] leading-none tabular-nums">{weeks}</dd>
        </div>
      </dl>

      {earned.length > 0 && (
        <section aria-label={t("share.milestones")} className="grid gap-3">
          {!compact && <h2 className="text-[13px] text-muted-foreground">{t("share.milestones")}</h2>}
          <ul className="flex flex-wrap gap-2">
            {(compact ? earned.slice(-3) : earned).map((m) => {
              const Icon = MILESTONE_ICON[m];
              return (
                <li key={m} className="o-milestone inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px]" data-earned="true">
                  <Icon className="size-3.5 text-muted-foreground" aria-hidden /> {t(`share.m.${m}`)}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </article>
  );
}
