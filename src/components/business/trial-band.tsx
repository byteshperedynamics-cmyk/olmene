"use client";

import Link from "next/link";
import { ArrowRight, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import { TRIAL_DAYS } from "@/lib/trial/rules";

/** "Choosing for a company or an agency?" — the way to /business/#trial from pricing. */
export function TrialBand({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rim bg-chip/50 p-6 sm:p-7 ${className ?? ""}`}>
      <div className="flex items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-rim bg-background">
          <UsersRound className="size-[18px]" aria-hidden />
        </span>
        <div className="grid gap-1">
          <h2 className="text-[17px] font-semibold">{t("pricing.trial.title")}</h2>
          <p className="max-w-xl text-[15px] text-muted-foreground">{t("pricing.trial.body", { days: TRIAL_DAYS })}</p>
        </div>
      </div>
      <Button asChild variant="sheen">
        <Link href="/business/#trial">
          {t("pricing.trial.cta")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
        </Link>
      </Button>
    </div>
  );
}
