"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Award, BadgeCheck, Bot, CalendarCheck, Check, FileText, Globe, PartyPopper, Share2, TrendingUp, UserRound, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AccountMilestone, AccountMilestoneId } from "@/lib/account/progress";

export const MILESTONE_COPY: Record<AccountMilestoneId, { title: string; todo: string; href?: string; cta?: string; icon: typeof Award }> = {
  joined: { title: "Joined Olmene", todo: "", icon: PartyPopper },
  profile: { title: "Face and name", todo: "Add your name and a photo.", href: "#profile", cta: "Finish your profile", icon: UserRound },
  first_report: { title: "First full report", todo: "Run a full analysis of your site.", href: "/app/new/", cta: "Start an analysis", icon: FileText },
  first_site: { title: "A site on watch", todo: "Sites are re-checked weekly once their first report is done.", href: "/app/new/", cta: "Start an analysis", icon: Globe },
  first_fix: { title: "First fix shipped", todo: "Approve a fix pull request, or finish a guided fix.", href: "/app/sites/", cta: "See open fixes", icon: Wrench },
  score_75: { title: "In good shape", todo: "Get a site's readiness score to 75 or more.", href: "/app/sites/", cta: "See what's left", icon: BadgeCheck },
  up_10: { title: "Ten points up", todo: "Raise a site's score by 10 points since its first check.", href: "/app/sites/", cta: "See what's left", icon: TrendingUp },
  shared: { title: "Shared your progress", todo: "Send a friend the link to a site's progress.", href: "#progress", cta: "Share progress", icon: Share2 },
  weeks_4: { title: "Four weeks on watch", todo: "Keep a site on weekly watch for four weeks.", icon: CalendarCheck },
  ai_mention: { title: "Seen by AI", todo: "Get your site named in an AI assistant's answer.", href: "/app/sites/", cta: "Check AI visibility", icon: Bot },
};

/** A ring that fills to the share of milestones earned. */
export function MilestoneRing({ earned, total, size = 64 }: { earned: number; total: number; size?: number }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(total ? earned / total : 0));
    return () => cancelAnimationFrame(id);
  }, [earned, total]);
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--rim)" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - shown)}
          className="o-ring-fill text-foreground"
        />
      </svg>
      <span className="o-readout-strong text-[15px] tabular-nums">
        {earned}
        <span className="text-[11px] text-muted-foreground">/{total}</span>
      </span>
    </span>
  );
}

/**
 * The ten account milestones. The next one to earn comes first, on its own,
 * with the action that gets it; then all ten in journey order: earned ones
 * lit with a check, the rest quiet with a one-line hint.
 */
export function MilestoneGrid({
  list,
  next,
  onShare,
  todoOverride,
}: {
  list: AccountMilestone[];
  next: AccountMilestoneId | null;
  onShare?: () => void;
  /** A more precise hint for one milestone (e.g. "Add a photo" when the name is already set). */
  todoOverride?: Partial<Record<AccountMilestoneId, string>>;
}) {
  const todo = (id: AccountMilestoneId) => todoOverride?.[id] ?? MILESTONE_COPY[id].todo;
  const nc = next ? MILESTONE_COPY[next] : null;
  const NextIcon = nc?.icon;
  return (
    <div className="grid gap-4">
      {next && nc && NextIcon && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-rim bg-chip/60 p-4 shadow-[inset_0_1px_0_var(--edge-top)] sm:p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-rim bg-background">
            <NextIcon className="size-5" aria-hidden />
          </span>
          {/* min-w lets the button wrap under the text on phones instead of squeezing it to one word per line */}
          <div className="grid min-w-[12rem] flex-1 gap-0.5">
            <p className="text-[12.5px] text-muted-foreground">Up next</p>
            <p className="text-[15px] font-medium">{nc.title}</p>
            <p className="text-[13.5px] leading-snug text-muted-foreground">{todo(next)}</p>
          </div>
          {nc.href && nc.cta && (
            nc.href === "#progress" && onShare ? (
              <Button size="sm" onClick={onShare} className="w-full shrink-0 sm:w-auto">
                {nc.cta} <ArrowRight className="size-3.5" aria-hidden />
              </Button>
            ) : (
              <Button asChild size="sm" className="w-full shrink-0 sm:w-auto">
                <Link href={nc.href}>
                  {nc.cta} <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </Button>
            )
          )}
        </div>
      )}
      {!next && (
        <p className="flex items-center gap-2 text-[14px]">
          <PartyPopper className="size-4 text-tel-emerald" aria-hidden /> Every milestone reached. Nicely done.
        </p>
      )}
      <ol className="grid gap-2 sm:grid-cols-2">
        {list.map(({ id, earned }) => {
          const c = MILESTONE_COPY[id];
          const Icon = c.icon;
          return (
            <li key={id} data-earned={earned} className={cn("o-milestone flex items-center gap-3 rounded-xl border border-edge px-3.5 py-3", !earned && "text-muted-foreground")}>
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-lg border",
                  earned ? "border-tel-emerald/35 bg-tel-emerald/10 text-tel-emerald" : "border-edge",
                )}
              >
                {earned ? <Check className="size-4" strokeWidth={2.5} aria-hidden /> : <Icon className="size-4" aria-hidden />}
              </span>
              <span className="grid min-w-0 gap-0.5">
                <span className={cn("text-[14px]", earned && "font-medium text-foreground")}>
                  {c.title}
                  <span className="sr-only">{earned ? " (reached)" : " (not yet)"}</span>
                </span>
                {!earned && id !== next && todo(id) && <span className="truncate text-[12.5px]">{todo(id)}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
