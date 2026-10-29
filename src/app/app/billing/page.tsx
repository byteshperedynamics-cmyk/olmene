"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LogoLoader } from "@/components/logo-loader";
import { TierCard, splitPrice } from "@/components/v2/pricing/plan-grid";
import { Eyebrow } from "@/components/v2/atoms";
import { getEntitlement, getPlans, type Plan } from "@/lib/data";
import { createCheckout, createPortalSession, ApiRequestError } from "@/lib/api";
import { CHECK_COUNT } from "@/lib/config";
import { fmtDateTime, fmtDate } from "@/lib/format";
import { track } from "@/lib/track";
import { useSession } from "@/lib/session";
import { useWorkspaces } from "@/lib/workspace/client";

/** Billing period of a plan row (mirrors plan-grid's intervalOf). */
function intervalOf(p: Plan): "month" | "year" | "once" {
  return p.billing_interval ?? (p.one_time ? "once" : "month");
}

function peopleLine(p: Plan): string | null {
  if (p.slug?.startsWith("team")) return `Up to ${p.sites_limit ?? 5} sites · 5 people`;
  if (p.slug?.startsWith("fix")) return (p.sites_limit ?? 1) === 1 ? "One site · 2 people" : `Up to ${p.sites_limit} sites`;
  return p.sites_limit && p.sites_limit > 1 ? `Up to ${p.sites_limit} sites` : null;
}

/** Value-first feature list built from the plan row, so DB changes flow through. */
function featuresFor(p: Plan): string[] {
  const lines = [
    p.actions_per_period ? `Up to ${p.actions_per_period} fix pull requests a month` : null,
    p.reports_per_period
      ? `${p.reports_per_period} full ${p.reports_per_period === 1 ? "analysis" : "analyses"} per month`
      : null,
  ];
  if (p.features_key === "plan.fix") lines.push("Weekly re-checks of every fix you merge", "Fixes for search and AI-answer visibility");
  if (p.features_key === "plan.team") lines.push("A/B tests as pull requests (coming soon)", "Priority support");
  const people = peopleLine(p);
  if (people) lines.push(people);
  return lines.filter(Boolean) as string[];
}

export default function BillingPage() {
  const router = useRouter();
  // Plan preselected from the pricing page (?plan=<product_id>) — highlighted
  // so the visitor who clicked "Get Pro" lands on the card they chose.
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  useEffect(() => {
    if (window.location.search.includes("checkout=success")) {
      router.replace("/app/checkout/success");
      return;
    }
    const plan = new URLSearchParams(window.location.search).get("plan");
    if (plan) setSelectedPlan(plan);
  }, [router]);

  const { data: ent } = useQuery({ queryKey: ["entitlement"], queryFn: getEntitlement });
  const { data: plans } = useQuery({ queryKey: ["plans"], queryFn: getPlans });
  const [busy, setBusy] = useState<string | null>(null);
  const [yearly, setYearly] = useState(false);
  // In someone else's workspace you see their plan, but only the owner pays or changes it.
  const { session } = useSession();
  const { current: workspace } = useWorkspaces(session);
  const shared = !!workspace && !workspace.own;
  const ownerName = workspace?.ownerName ?? "the owner";

  async function subscribe(productId: string, planName?: string) {
    setBusy(productId);
    try {
      const { url } = await createCheckout(productId);
      track("checkout_start", { plan: planName ?? "unknown", product_id: productId });
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Could not start checkout. Please try again.");
      setBusy(null);
    }
  }

  async function manage() {
    setBusy("portal");
    try {
      const { url } = await createPortalSession();
      window.location.href = url;
    } catch (err) {
      toast.error(
        err instanceof ApiRequestError && err.code === "portal_unavailable"
          ? "The billing portal is temporarily unavailable — please try again later."
          : "Could not open the billing portal. Please try again.",
      );
      setBusy(null);
    }
  }

  const sorted = [...(plans ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const hasYearly = sorted.some((p) => intervalOf(p) === "year");
  const subs = sorted.filter((p) => intervalOf(p) === (yearly && hasYearly ? "year" : "month"));
  const oneTimes = sorted.filter((p) => intervalOf(p) === "once");
  // Fix is the plan the product is built around; it keeps the lit card.
  const fixPlan = subs.find((p) => p.slug?.startsWith("fix")) ?? subs[0];
  const creditOnly = !!ent && !ent.active && ent.reportCredits > 0;
  const onFree = !!ent && !ent.active;
  const quotaPct = ent && ent.quotaTotal > 0 ? Math.min(100, Math.round((ent.quotaUsed / ent.quotaTotal) * 100)) : 0;

  const isCurrent = (p: Plan) =>
    !!ent?.active && !p.one_time && (ent.productId ? ent.productId === p.polar_product_id : p.name === ent.planName);

  /** The card CTA, read-only in a shared workspace. */
  function planCta(p: Plan, highlight: boolean) {
    const current = isCurrent(p);
    const selected = selectedPlan === p.polar_product_id;
    if (shared) {
      return (
        <Button variant="hairline" size="xl" className="w-full" disabled>
          Ask {ownerName}
        </Button>
      );
    }
    if (current) {
      return (
        <Button variant="hairline" size="xl" className="w-full" disabled>
          You're on this plan
        </Button>
      );
    }
    return (
      <Button
        className="w-full"
        variant={highlight || selected ? "sheen" : "hairline"}
        size="xl"
        disabled={busy === p.polar_product_id}
        onClick={() => subscribe(p.polar_product_id, p.name)}
      >
        {busy === p.polar_product_id ? (
          <LogoLoader size={16} />
        ) : (
          <>
            {ent?.active
              ? // Same plan, other interval: monthly ⇄ yearly.
                ent.planName === p.name
                ? `Switch to ${intervalOf(p) === "year" ? "yearly" : "monthly"} billing`
                : `Switch to ${p.name}`
              : selected
                ? `Continue with ${p.name}`
                : p.slug?.startsWith("fix")
                  ? "Start fixing"
                  : `Choose ${p.name}`}
            <ArrowRight className="size-4 rtl-flip" aria-hidden />
          </>
        )}
      </Button>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-8">
      <header className="grid gap-2">
        <Eyebrow>Billing</Eyebrow>
        <h1 className="o-display text-[32px] leading-tight">Plans and purchases</h1>
        <p className="max-w-xl text-[15px] text-muted-foreground">
          Subscriptions ship fixes as pull requests; single reports run on credits. Cancel any time — access runs to
          the end of your period.
        </p>
      </header>

      {!shared && ent && !ent.active && (
        <p className="rounded-xl border border-rim bg-chip/50 px-4 py-3 text-sm">
          Setting Olmene up for a company or an agency?{" "}
          <Link href="/business/#trial" className="font-medium underline underline-offset-4">
            Ask for 14 days of Agency, free
          </Link>
          . We set it up within one working day.
        </p>
      )}

      {shared && (
        <p className="o-well rounded-xl px-5 py-4 text-[14px] text-muted-foreground">
          {ownerName} looks after billing for {workspace.name}. Everyone here shares the plan below; to change it, ask
          them.
        </p>
      )}

      {ent && (ent.active || creditOnly || ent.hasPurchases) && (
        <section className="o-artifact grid gap-5 rounded-2xl p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="grid gap-1.5">
              <p className="o-eyebrow">{ent.active ? "Current plan" : creditOnly ? "Report credits" : "Your purchases"}</p>
              <p className="o-display text-[22px]">{ent.active ? ent.planName : "Single Report"}</p>
              <p className="text-[14px] text-muted-foreground">
                {creditOnly ? (
                  <>
                    <span className="o-readout">{ent.reportCredits}</span>{" "}
                    {ent.reportCredits === 1 ? "credit" : "credits"} available
                    {ent.creditsExpireAt ? <> · valid until {fmtDate(ent.creditsExpireAt)}</> : null}
                  </>
                ) : !ent.active ? (
                  <>No active plan and no unused report credits.</>
                ) : (
                  <>
                    {ent.renewsAt
                      ? ent.cancelAtPeriodEnd
                        ? "Cancels at period end"
                        : `Renews ${fmtDateTime(ent.renewsAt)}`
                      : "Plan active"}
                  </>
                )}
              </p>
            </div>
            {!shared && ent.active && (
              <Button variant="hairline" size="sm" onClick={manage} disabled={busy === "portal"}>
                {busy === "portal" ? <LogoLoader size={16} /> : <ExternalLink className="size-4" aria-hidden />}
                Manage subscription
              </Button>
            )}
          </div>

          {ent.active && ent.quotaTotal > 0 && (
            <div className="grid gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13px] text-muted-foreground">Reports this month</p>
                <p className="o-readout-strong text-[15px]">
                  {ent.quotaUsed} / {ent.quotaTotal}
                </p>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
                <div className="h-full rounded-full bg-foreground/70 transition-[width]" style={{ width: `${quotaPct}%` }} />
              </div>
              {ent.cancelAtPeriodEnd && ent.renewsAt && (
                <p className="text-[12px] text-muted-foreground">Access runs until {fmtDate(ent.renewsAt)}.</p>
              )}
            </div>
          )}

          {ent.reportCredits > 0 && ent.active && (
            <p className="text-[13px] text-muted-foreground">
              Plus <span className="o-readout">{ent.reportCredits}</span> one-time{" "}
              {ent.reportCredits === 1 ? "credit" : "credits"} on top of the monthly quota
              {ent.creditsExpireAt ? <> — valid until {fmtDate(ent.creditsExpireAt)}</> : null}.
            </p>
          )}

          {!ent.active && ent.hasPurchases && !shared && (
            <div>
              <Button variant="hairline" size="sm" onClick={manage} disabled={busy === "portal"}>
                {busy === "portal" ? <LogoLoader size={16} /> : <ExternalLink className="size-4" aria-hidden />}
                Receipts and invoices
              </Button>
            </div>
          )}
        </section>
      )}

      <section className="grid gap-6" aria-label="Plans">
        {hasYearly && (
          <div className="flex justify-center">
            <div className="o-well inline-flex rounded-xl p-1" role="group" aria-label="Billing period">
              {[false, true].map((y) => (
                <button
                  key={String(y)}
                  type="button"
                  aria-pressed={yearly === y}
                  onClick={() => setYearly(y)}
                  className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors duration-[var(--dur-state)] ${
                    yearly === y
                      ? "bg-chip text-foreground shadow-[inset_0_1px_0_var(--edge-top)]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {y ? "Yearly" : "Monthly"}
                  {y && <span className="ms-1.5 font-mono text-[11px] text-tel-emerald">−20%</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid items-stretch gap-4 md:grid-cols-3">
          <TierCard
            name="Free"
            amount="€0"
            suffix=""
            features={[`Instant site scan`, `${CHECK_COUNT} checks on your real HTML`, "Your top 3 problems, with evidence"]}
            flag={onFree ? "Current plan" : undefined}
            cta={
              shared ? (
                <Button variant="hairline" size="xl" className="w-full" disabled>
                  Ask {ownerName}
                </Button>
              ) : ent?.active ? (
                <Button variant="hairline" size="xl" className="w-full" onClick={manage} disabled={busy === "portal"}>
                  {busy === "portal" ? <LogoLoader size={16} /> : "Move to Free"}
                </Button>
              ) : (
                <Button variant="hairline" size="xl" className="w-full" disabled>
                  You're on Free
                </Button>
              )
            }
          />

          {subs.map((p) => {
            const current = isCurrent(p);
            const selected = selectedPlan === p.polar_product_id;
            const highlight = p === fixPlan;
            const price =
              intervalOf(p) === "year" && p.monthly_equivalent_eur
                ? { amount: `€${p.monthly_equivalent_eur}`, suffix: "/ month, billed yearly" }
                : splitPrice(p.price_label);
            return (
              <TierCard
                key={p.polar_product_id}
                name={p.name}
                amount={price.amount}
                suffix={price.suffix}
                highlight={highlight}
                flag={current ? "Current plan" : selected ? "Your selection" : highlight ? "Recommended" : undefined}
                features={featuresFor(p)}
                cta={planCta(p, highlight)}
              />
            );
          })}
        </div>

        {oneTimes.map((p) => (
          <div
            key={p.polar_product_id}
            className="o-well flex flex-col gap-4 rounded-2xl px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8"
          >
            <div className="min-w-0">
              <p className="text-[15px]">
                <span className="font-medium">Single Report</span>{" "}
                <span className="text-muted-foreground">
                  — one full cited analysis: market and competitor research, the five-part audit, a scored report and a
                  90-day roadmap. No subscription.
                </span>
              </p>
              <p className="mt-1.5 font-mono text-[11px] text-faint">Credit valid for 90 days · no GitHub access needed</p>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <span className="o-readout-strong text-2xl">{splitPrice(p.price_label).amount}</span>
              {shared ? (
                <Button variant="hairline" disabled>
                  Ask {ownerName}
                </Button>
              ) : (
                <Button
                  variant="hairline"
                  disabled={busy === p.polar_product_id}
                  onClick={() => subscribe(p.polar_product_id, p.name)}
                >
                  {busy === p.polar_product_id ? <LogoLoader size={16} /> : "Buy a single report"}
                </Button>
              )}
            </div>
          </div>
        ))}
      </section>

      <ul className="grid gap-2 border-t pt-6 text-[13px] text-muted-foreground sm:grid-cols-3">
        {[
          "Payments, VAT and invoices are handled by Polar (merchant of record).",
          "Failed analyses never count against your quota.",
          "Your reports stay in your account even if you cancel.",
        ].map((line) => (
          <li key={line} className="flex gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-foreground/60" strokeWidth={2.25} aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
