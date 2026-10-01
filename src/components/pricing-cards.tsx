"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { getPlans } from "@/lib/data";
import { useI18n } from "@/i18n/provider";

export function PricingTeaser() {
  const { t } = useI18n();
  const { data: plans } = useQuery({ queryKey: ["plans"], queryFn: getPlans });
  const cheapest = [...(plans ?? [])]
    .filter((p) => !p.one_time)
    .sort((a, b) => a.sort_order - b.sort_order)[0];
  return (
    <div className="mt-8 text-sm text-muted-foreground">
      {cheapest ? (
        <>
          {t("pt.plansFrom")}{" "}
          <Link href="/pricing/" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
            {cheapest.price_label}
          </Link>{" "}
          · {t("pt.noLockin")}
        </>
      ) : (
        <>{t("pt.simple")}</>
      )}
    </div>
  );
}
