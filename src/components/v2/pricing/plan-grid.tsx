"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getEntitlement, getPlans, type Plan } from "@/lib/data";
import { CHECK_COUNT } from "@/lib/config";
import { featureAgentEnabled } from "@/lib/agent-client";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { LivePill } from "../atoms";

/** Buy CTA: straight to billing when signed in, otherwise through login. */
function ctaHref(productId: string, loggedIn: boolean): string {
  const target = `/app/billing/?plan=${productId}`;
  return loggedIn ? target : `/login/?next=${encodeURIComponent(target)}`;
}

/** "€49 / month" → { amount: "€49", suffix: "/ month" } (display only). */
function splitPrice(label: string): { amount: string; suffix: string } {
  const m = label.match(/^\s*([^\d\s]*\s?[\d.,]+)\s*(.*)$/);
  return m ? { amount: m[1].replace(/\s/g, ""), suffix: m[2] } : { amount: label, suffix: "" };
}

function intervalOf(p: Plan): "month" | "year" | "once" {
  if (p.billing_interval) return p.billing_interval;
  return p.one_time ? "once" : "month";
}

/**
 * Pricing v2 (brief §5E). Renders whatever plans are active in the DB:
 * today Starter/Pro/Single; once the pending Fix/Team rows land, those — with
 * no code change. The billing toggle exists only when yearly plans exist.
 * Signature motion: light travelling around the highlighted plan's border.
 */
export function PlanGrid({ initialPlans }: { initialPlans?: Plan[] } = {}) {
  const { t } = useI18n();
  const { loggedIn } = useSession();
  const agentOn = featureAgentEnabled();
  const { data: plans, isLoading, isError } = useQuery({
    queryKey: ["plans"],
    queryFn: getPlans,
    // Server-rendered plans (pricing page) so prices are in the HTML.
    initialData: initialPlans?.length ? initialPlans : undefined,
  });
  const { data: ent } = useQuery({ queryKey: ["entitlement"], queryFn: getEntitlement, enabled: loggedIn });

  const sorted = useMemo(() => [...(plans ?? [])].sort((a, b) => a.sort_order - b.sort_order), [plans]);
  const hasYearly = sorted.some((p) => intervalOf(p) === "year");
  const [yearly, setYearly] = useState(false);
  const subs = sorted.filter((p) => intervalOf(p) === (yearly && hasYearly ? "year" : "month"));
  const oneTimes = sorted.filter((p) => intervalOf(p) === "once");
  const highlight = subs.find((p) => p.slug?.startsWith("fix")) ?? subs[subs.length - 1];

  const featuresFor = (p: Plan): string[] => {
    const fixes = p.actions_per_period ?? 0;
    if (p.features_key) {
      const keys = ["f1", "f2", "f3", "f4"].map((f) => `${p.features_key}.${f}`);
      // The full cited reports each plan includes are what the fixes are planned from.
      const reports = p.reports_per_period ? [t("pc.feature.reports", { n: p.reports_per_period })] : [];
      return [...reports, ...keys.map((k) => t(k, { n: fixes, sites: p.sites_limit ?? 1 }))];
    }
    // Current report-based plans (Starter / Pro)
    const isPro = p === subs[subs.length - 1] && subs.length > 1;
    const base = isPro
      ? [t("pc.feature.reports", { n: p.reports_per_period }), t("pc.pro.everything"), t("pc.pro.support"), t("pc.pro.tracking")]
      : [
          t("pc.feature.reports", { n: p.reports_per_period }),
          t("pc.feature.research"),
          t("pc.feature.audit", { n: CHECK_COUNT }),
          t("pc.feature.roadmap"),
        ];
    return agentOn && fixes > 0 ? [...base, t("pc.feature.fixes", { n: fixes })] : base;
  };

  const ctaFor = (p: Plan, isHighlight: boolean) => {
    if (p.slug?.startsWith("fix")) return t("pc.cta.fix");
    if (p.slug?.startsWith("team")) return t("pc.cta.team");
    return isHighlight ? t("pc.cta.pro") : t("pc.cta.starter");
  };

  return (
    <div className="grid gap-6">
      {hasYearly && (
        <div className="flex justify-center">
          <div className="inline-flex rounded-xl border bg-card p-1" role="group" aria-label={t("pc.billing")}>
            {[false, true].map((y) => (
              <button
                key={String(y)}
                type="button"
                aria-pressed={yearly === y}
                onClick={() => setYearly(y)}
                className={cn(
                  "rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors duration-[var(--dur-state)]",
                  yearly === y ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {y ? t("pc.yearly") : t("pc.monthly")}
                {y && <span className="ms-1.5 font-mono text-[11px] text-primary">−20%</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid items-stretch gap-4 md:grid-cols-3">
        {/* Free — always available */}
        <TierCard
          name={t("pc.free.name")}
          amount="€0"
          suffix=""
          features={[t("pc.free.f1"), t("pc.free.f2", { n: CHECK_COUNT }), t("pc.free.f3")]}
          cta={
            <Button asChild variant="hairline" size="xl" className="w-full">
              <Link href="/#free-diagnosis">{t("pc.free.cta")}</Link>
            </Button>
          }
        />

        {isLoading
          ? [0, 1].map((i) => <div key={i} className="o-skeleton h-[420px] rounded-2xl" />)
          : subs.map((p) => {
              const isHighlight = p === highlight;
              const current = ent?.active && (ent.productId ? ent.productId === p.polar_product_id : ent.planName === p.name);
              const yearlyPlan = intervalOf(p) === "year";
              const price = yearlyPlan && p.monthly_equivalent_eur
                ? { amount: `€${p.monthly_equivalent_eur}`, suffix: t("pc.perMonthYearly") }
                : splitPrice(p.price_label);
              return (
                <TierCard
                  key={p.polar_product_id}
                  name={p.name}
                  amount={price.amount}
                  suffix={price.suffix}
                  highlight={isHighlight}
                  flag={current ? t("pc.current") : isHighlight ? t("pc.mostFounders") : undefined}
                  features={featuresFor(p)}
                  cta={
                    current ? (
                      <Button asChild variant="hairline" size="xl" className="w-full">
                        <Link href="/app/billing/">{t("pc.manage")}</Link>
                      </Button>
                    ) : (
                      <Button asChild variant={isHighlight ? "sheen" : "hairline"} size="xl" className="w-full">
                        <Link href={ctaHref(p.polar_product_id, loggedIn)}>
                          {ctaFor(p, isHighlight)} {isHighlight && <ArrowRight className="size-4 rtl-flip" aria-hidden />}
                        </Link>
                      </Button>
                    )
                  }
                />
              );
            })}
      </div>

      {!isLoading && (isError || sorted.length === 0) && (
        <p className="text-center text-sm text-muted-foreground">{t("pc.updating")}</p>
      )}

      {oneTimes.map((p) => (
        <div
          key={p.polar_product_id}
          className="flex flex-col gap-4 rounded-2xl border border-dashed px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8"
        >
          <div className="min-w-0">
            <p className="text-[15px]">
              <span className="font-medium">{t("gh.title")}</span>{" "}
              <span className="text-muted-foreground">{t("pc.onetime.body")}</span>
            </p>
            <p className="mt-1.5 font-mono text-[11px] text-faint">{t("pc.onetime.validity")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <span className="font-display text-2xl">{splitPrice(p.price_label).amount}</span>
            <Button asChild variant="hairline">
              <Link href={ctaHref(p.polar_product_id, loggedIn)}>{t("pc.onetime.cta")}</Link>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function TierCard({
  name,
  amount,
  suffix,
  features,
  cta,
  highlight,
  flag,
}: {
  name: string;
  amount: string;
  suffix: string;
  features: string[];
  cta: React.ReactNode;
  highlight?: boolean;
  flag?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col gap-5 rounded-2xl p-6 sm:p-7",
        highlight ? "o-glow-border" : "border bg-card",
      )}
    >
      {flag && (
        <LivePill tone="live" pulse={false} className="absolute -top-3 end-5 bg-[color-mix(in_oklab,var(--primary)_16%,var(--card))]">
          {flag}
        </LivePill>
      )}
      <div>
        <h2 className="o-display text-[22px]">{name}</h2>
        <p className="mt-3 flex items-baseline gap-1.5">
          <span key={amount} className="o-crossfade font-display text-[40px] leading-none tabular-nums">
            {amount}
          </span>
          {suffix && <span className="text-[13px] text-muted-foreground">{suffix}</span>}
        </p>
      </div>
      <ul className="grid flex-1 content-start gap-2.5 text-[14px] text-muted-foreground">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <span aria-hidden className="inline-block font-mono text-primary rtl:-scale-x-100">
              →
            </span>
            <span className="text-foreground/85">{f}</span>
          </li>
        ))}
      </ul>
      {cta}
    </div>
  );
}
