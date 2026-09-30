"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { getPlans } from "@/lib/data";
import { useSession } from "@/lib/session";
import { Enter } from "@/components/motion";
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

/** "≈ $9.50 per report" — parsed from the plan's price label. */
function perReportLabel(priceLabel: string, reports: number): string | null {
  if (!reports) return null;
  const m = priceLabel.match(/^([^\d]*)([\d.,]+)/);
  if (!m) return null;
  const amount = Number(m[2].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const per = amount / reports;
  const price = per % 1 === 0 ? String(per) : per.toFixed(2);
  return `${m[1]}${price}`;
}

/** Where the buy CTA lands: straight to billing when signed in, otherwise
 *  through login — but the button never says "sign in". Peak purchase intent
 *  should read as a purchase, not an account chore. */
function ctaHref(productId: string, loggedIn: boolean): string {
  const target = `/app/billing/?plan=${productId}`;
  return loggedIn ? target : `/login/?next=${encodeURIComponent(target)}`;
}

export function PlanCards() {
  const { t } = useI18n();
  const { loggedIn } = useSession();
  const { data: plans, isLoading } = useQuery({ queryKey: ["plans"], queryFn: getPlans });
  const sorted = [...(plans ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const subs = sorted.filter((p) => !p.one_time);
  const oneTimes = sorted.filter((p) => p.one_time);

  const starterFeatures = (reports: number) => [
    t("pc.feature.reports", { n: reports }),
    t("pc.feature.research"),
    t("pc.feature.audit"),
    t("pc.feature.roadmap"),
    t("pc.feature.export"),
    t("pc.feature.forever"),
  ];
  // Pro is not "more of the same" — it is the tier for people actively
  // iterating: everything in Starter plus structural extras (priority
  // support, capacity to re-audit and track movement month over month).
  const proFeatures = (reports: number) => [
    t("pc.feature.reports", { n: reports }),
    t("pc.pro.everything"),
    t("pc.pro.support"),
    t("pc.pro.tracking"),
    t("pc.feature.forever"),
  ];

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-96 animate-pulse rounded-xl border bg-card" />
        ))}
      </div>
    );
  }
  if (!sorted.length) {
    return <p className="text-center text-muted-foreground">{t("pc.updating")}</p>;
  }

  return (
    <div className="space-y-10">
      {/* ── Subscriptions ── */}
      <div className="grid gap-6 md:grid-cols-2">
        {subs.map((p, i) => {
          const isPro = i === subs.length - 1;
          const features = isPro ? proFeatures(p.reports_per_period) : starterFeatures(p.reports_per_period);
          const per = perReportLabel(p.price_label, p.reports_per_period);
          return (
            <Enter key={p.polar_product_id} delay={i * 0.1} className="h-full">
              <div
                className={`card-lift relative flex h-full flex-col rounded-xl border bg-card p-6 shadow-sm sm:p-8 ${
                  isPro ? "border-primary/50 shadow-md ring-1 ring-primary/20" : ""
                }`}
              >
                {isPro && (
                  <span className="absolute -top-3 start-6 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                    {t("pc.mostPopular")}
                  </span>
                )}
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-display text-xl font-semibold">{p.name}</h3>
                  <div className="text-end">
                    <p className="font-display text-2xl font-bold">{p.price_label}</p>
                    {per && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("pc.perReport", { price: per })}
                      </p>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("pc.subtitle", { n: p.reports_per_period, tagline: isPro ? t("pc.tagline.pro") : t("pc.tagline.starter") })}
                </p>
                <ul className="mt-6 flex-1 space-y-3.5 text-sm">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={ctaHref(p.polar_product_id, loggedIn)}
                  className={`mt-8 inline-flex h-11 items-center justify-center rounded-md px-6 text-sm font-medium transition-colors ${
                    isPro
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-input bg-background hover:bg-accent"
                  }`}
                >
                  {isPro ? t("pc.cta.pro") : t("pc.cta.starter")}
                </Link>
              </div>
            </Enter>
          );
        })}
      </div>

      {/* ── One-time report: the no-subscription path ── */}
      {oneTimes.map((p) => (
        <Enter key={p.polar_product_id} delay={0.15}>
          <div className="flex flex-col items-start gap-5 rounded-xl border border-dashed border-border bg-secondary/30 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div className="max-w-xl">
              <p className="section-label">{t("pc.onetime.label")}</p>
              <h3 className="mt-1.5 font-display text-xl font-semibold">{t("pc.onetime.title")}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("pc.onetime.body")}</p>
              <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
                <Sparkles className="size-3.5 text-primary" aria-hidden />
                {t("pc.onetime.validity")}
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-col items-start gap-3 sm:w-auto sm:items-end">
              <p className="font-display text-2xl font-bold">{p.price_label}</p>
              <Link
                href={ctaHref(p.polar_product_id, loggedIn)}
                className="inline-flex h-11 w-full items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium transition-colors hover:bg-accent sm:w-auto"
              >
                {t("pc.onetime.cta")}
              </Link>
            </div>
          </div>
        </Enter>
      ))}
    </div>
  );
}
