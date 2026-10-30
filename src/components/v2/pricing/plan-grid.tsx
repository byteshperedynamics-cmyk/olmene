"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getEntitlement, getPlans, type Plan } from "@/lib/data";
import { CHECK_COUNT } from "@/lib/config";
import { featureAgentEnabled } from "@/lib/agent-client";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/** Buy CTA: straight to billing when signed in, otherwise through login. */
function ctaHref(productId: string, loggedIn: boolean): string {
  const target = `/app/billing/?plan=${productId}`;
  return loggedIn ? target : `/login/?next=${encodeURIComponent(target)}`;
}

/** "€49 / month" → { amount: "€49", suffix: "/ month" } (display only). */
export function splitPrice(label: string): { amount: string; suffix: string } {
  const m = label.match(/^\s*([^\d\s]*\s?[\d.,]+)\s*(.*)$/);
  return m ? { amount: m[1].replace(/\s/g, ""), suffix: m[2] } : { amount: label, suffix: "" };
}

/**
 * The name shown on a plan card. "Team" became "Agency" in migration
 * 20261026_plan_agency_name; /pricing/ reads plans at build time, which can run
 * before that migration, so the card maps the slug as well.
 */
function displayName(p: Plan): string {
  return p.slug?.startsWith("team") ? "Agency" : p.name;
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
export function PlanGrid({ initialPlans, layout = "full" }: { initialPlans?: Plan[]; layout?: "full" | "home" } = {}) {
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
  // Agency leads (refinement 2026-10-30): it's the plan the product is built around.
  const highlight = subs.find((p) => p.slug?.startsWith("team")) ?? subs[subs.length - 1];

  const featuresFor = (p: Plan): string[] => {
    const fixes = p.actions_per_period ?? 0;
    // Package-specific lines: site capacity apart from monthly analyses, and
    // what each plan delivers that the other doesn't.
    if (p.slug?.startsWith("team"))
      return [
        t("plan.agency.sites", { sites: p.sites_limit ?? 5 }),
        t("plan.agency.analyses", { n: p.reports_per_period }),
        t("plan.team.f2", { n: fixes }),
        t("plan.agency.pages"),
        t("plan.agency.reports"),
        t("plan.agency.whiteLabel"),
        t("plan.agency.team"),
      ];
    if (p.slug?.startsWith("fix"))
      return [
        t("plan.fix.site"),
        t("pc.feature.reports", { n: p.reports_per_period }),
        t("plan.fix.f2", { n: fixes }),
        t("plan.fix.delivery"),
        t("plan.fix.f1"),
      ];
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

  /** Agency: "Request agency trial" (assisted) first; subscribing is its own, labelled action. */
  const agencyCta = (p: Plan) => (
    <div className="grid gap-2">
      <Button asChild size="xl" className="w-full">
        <Link href="/business/#trial">
          {t("cta.agencyTrial")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
        </Link>
      </Button>
      <Button asChild size="xl" variant="hairline" className="w-full">
        <Link href={ctaHref(p.polar_product_id, loggedIn)}>{t("cta.agencyBuy")}</Link>
      </Button>
    </div>
  );

  const ctaFor = (p: Plan, isHighlight: boolean) => {
    if (p.slug?.startsWith("fix")) return t("pc.cta.fix");
    if (p.slug?.startsWith("team")) return t("pc.cta.team");
    return isHighlight ? t("pc.cta.pro") : t("pc.cta.starter");
  };

  if (layout === "home") {
    // Homepage (refinement 2026-10-30): Agency leads, Fix stays, the single
    // report sits apart on its own row; yearly billing stays on /pricing/.
    const report = oneTimes[0];
    const monthly = sorted.filter((p) => intervalOf(p) === "month");
    const agency = monthly.find((p) => p.slug?.startsWith("team"));
    const fix = monthly.find((p) => p.slug?.startsWith("fix"));
    return (
      <div className="grid gap-4">
        <div className="grid items-stretch gap-4 md:grid-cols-2">
          {isLoading ? (
            [0, 1].map((i) => <div key={i} className="o-skeleton h-[440px] rounded-xl" />)
          ) : (
            <>
              {agency && (
                <TierCard
                  name={displayName(agency)}
                  amount={splitPrice(agency.price_label).amount}
                  suffix={splitPrice(agency.price_label).suffix}
                  highlight
                  note={t("plan.agency.note", { sites: agency.sites_limit ?? 5, n: agency.reports_per_period })}
                  features={featuresFor(agency)}
                  cta={agencyCta(agency)}
                />
              )}
              {fix && (
                <TierCard
                  name={fix.name}
                  amount={splitPrice(fix.price_label).amount}
                  suffix={splitPrice(fix.price_label).suffix}
                  note={t("plan.fix.note")}
                  features={featuresFor(fix)}
                  cta={
                    <Button asChild variant="hairline" size="xl" className="w-full">
                      <Link href={ctaHref(fix.polar_product_id, loggedIn)}>{ctaFor(fix, false)}</Link>
                    </Button>
                  }
                />
              )}
            </>
          )}
        </div>
        {report && <ReportRow plan={report} href={ctaHref(report.polar_product_id, loggedIn)} />}
        {!isLoading && (isError || sorted.length === 0) && <p className="text-center text-sm text-muted-foreground">{t("pc.updating")}</p>}
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {hasYearly && (
        <div className="flex justify-center">
          <div className="o-well inline-flex rounded-xl p-1" role="group" aria-label={t("pc.billing")}>
            {[false, true].map((y) => (
              <button
                key={String(y)}
                type="button"
                aria-pressed={yearly === y}
                onClick={() => setYearly(y)}
                className={cn(
                  "rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors duration-[var(--dur-state)]",
                  yearly === y ? "bg-chip text-foreground shadow-[inset_0_1px_0_var(--edge-top)]" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {y ? t("pc.yearly") : t("pc.monthly")}
                {y && <span className="ms-1.5 font-mono text-[11px] text-tel-emerald">−20%</span>}
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
                  name={displayName(p)}
                  amount={price.amount}
                  suffix={price.suffix}
                  highlight={isHighlight}
                  flag={current ? t("pc.current") : isHighlight ? t("nav.business") : undefined}
                  note={
                    p.slug?.startsWith("team")
                      ? t("plan.agency.note", { sites: p.sites_limit ?? 5, n: p.reports_per_period })
                      : p.slug?.startsWith("fix")
                        ? t("plan.fix.note")
                        : undefined
                  }
                  features={featuresFor(p)}
                  cta={
                    current ? (
                      <Button asChild variant="hairline" size="xl" className="w-full">
                        <Link href="/app/billing/">{t("pc.manage")}</Link>
                      </Button>
                    ) : p.slug?.startsWith("team") ? (
                      agencyCta(p)
                    ) : (
                      <Button asChild variant={isHighlight ? "default" : "hairline"} size="xl" className="w-full">
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
        <ReportRow key={p.polar_product_id} plan={p} href={ctaHref(p.polar_product_id, loggedIn)} />
      ))}
    </div>
  );
}

/** The standalone report, apart from the plans: what it includes and what it doesn't. */
function ReportRow({ plan, href }: { plan: Plan; href: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="grid min-w-0 gap-1">
        <p className="text-[15px] font-medium">{t("pc.report.title")}</p>
        <p className="max-w-2xl text-[14px] leading-relaxed text-muted-foreground">{t("pc.report.body")}</p>
        <p className="text-[12.5px] text-faint">{t("pc.onetime.validity")}</p>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <span className="o-readout-strong text-2xl">{splitPrice(plan.price_label).amount}</span>
        <Button asChild variant="hairline">
          <Link href={href}>{t("pc.onetime.cta")}</Link>
        </Button>
      </div>
    </div>
  );
}

export function TierCard({
  name,
  amount,
  suffix,
  features,
  cta,
  highlight,
  flag,
  note,
}: {
  name: string;
  amount: string;
  suffix: string;
  features: string[];
  cta: React.ReactNode;
  highlight?: boolean;
  flag?: string;
  /** One plain line under the price (who it's for, what it counts). */
  note?: string;
}) {
  return (
    <div className={cn("relative flex min-w-0 flex-col gap-5 rounded-xl border p-6 sm:p-7", highlight ? "border-line-strong bg-card" : "bg-card/60")}>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="o-display text-[22px]">{name}</h2>
          {flag && <span className="text-[12.5px] font-medium text-muted-foreground">{flag}</span>}
        </div>
        <p className="mt-3 flex items-baseline gap-1.5">
          <span key={amount} className="o-crossfade o-readout-strong text-[36px] leading-none">
            {amount}
          </span>{" "}
          {suffix && <span className="text-[13px] text-muted-foreground">{suffix}</span>}
        </p>
        {note && <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">{note}</p>}
      </div>
      <ul className="grid flex-1 content-start gap-2.5 text-[14px] text-muted-foreground">
        {features.map((f) => (
          <li key={f} className="flex gap-2.5">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-foreground/70" strokeWidth={2.25} />
            <span className="text-foreground/85">{f}</span>
          </li>
        ))}
      </ul>
      {cta}
    </div>
  );
}
