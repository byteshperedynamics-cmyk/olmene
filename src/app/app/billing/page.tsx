"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ExternalLink, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoLoader } from "@/components/logo-loader";
import { getEntitlement, getPlans } from "@/lib/data";
import { createCheckout, createPortalSession, ApiRequestError } from "@/lib/api";
import { fmtDateTime, fmtDate } from "@/lib/format";
import { track } from "@/lib/track";

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
  const creditOnly = !!ent && !ent.active && ent.reportCredits > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plans are counted in fixes and reports, not seats. Cancel any time; access runs to the end of your period.
        </p>
      </div>

      {ent && (ent.active || creditOnly) && (
        <Card>
          <CardHeader>
            <CardTitle>{creditOnly ? "Report credits" : "Current plan"}</CardTitle>
            <CardDescription>
              {creditOnly ? (
                <>
                  {ent.reportCredits} report {ent.reportCredits === 1 ? "credit" : "credits"} available
                  {ent.creditsExpireAt ? ` · valid until ${fmtDate(ent.creditsExpireAt)}` : ""}
                </>
              ) : (
                <>
                  {ent.planName}
                  {ent.quotaTotal > 0 ? ` · ${ent.quotaUsed} of ${ent.quotaTotal} reports used` : ""}
                  {ent.reportCredits > 0 ? ` · +${ent.reportCredits} report ${ent.reportCredits === 1 ? "credit" : "credits"}` : ""}
                </>
              )}
            </CardDescription>
          </CardHeader>
          {ent.active ? (
            <CardContent className="space-y-3">
              {ent.renewsAt && (
                <p className="text-sm text-muted-foreground">
                  Renews {fmtDateTime(ent.renewsAt)}
                  {ent.cancelAtPeriodEnd ? " · cancels at period end" : ""}
                </p>
              )}
              {ent.reportCredits > 0 && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Sparkles className="size-4 text-primary" aria-hidden />
                  {ent.reportCredits} one-time report {ent.reportCredits === 1 ? "credit" : "credits"} on top of
                  your quota{ent.creditsExpireAt ? ` — valid until ${fmtDate(ent.creditsExpireAt)}` : ""}
                </p>
              )}
              <Button variant="outline" size="sm" onClick={manage} disabled={busy === "portal"}>
                {busy === "portal" ? <LogoLoader size={16} /> : <ExternalLink className="size-4" aria-hidden />}
                Manage subscription
              </Button>
            </CardContent>
          ) : (
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No subscription — single reports run on credits. Failed analyses never burn a credit.
              </p>
            </CardContent>
          )}
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {sorted.map((p) => {
          const selected = selectedPlan === p.polar_product_id;
          // The plan you already pay for can't be "switched" to.
          const current =
            !!ent?.active && !p.one_time && (ent.productId ? ent.productId === p.polar_product_id : p.name === ent.planName);
          return (
            <Card
              key={p.polar_product_id}
              className={`relative flex flex-col ${p.one_time ? "border-dashed" : ""} ${
                selected || current ? "border-primary/60 ring-2 ring-primary/30" : ""
              }`}
            >
              {current && !selected && (
                <span className="absolute -top-2.5 start-4 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                  Current plan
                </span>
              )}
              {selected && (
                <span className="absolute -top-2.5 start-4 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                  Your selection
                </span>
              )}
              <CardHeader>
                <div className="flex items-baseline justify-between gap-2">
                  <CardTitle>{p.name}</CardTitle>
                  <p className="font-display text-xl font-bold">{p.price_label}</p>
                </div>
                <CardDescription>
                  {p.one_time
                    ? `One full analysis · credit valid for 90 days`
                    : [
                        p.actions_per_period ? `Up to ${p.actions_per_period} fix pull requests a month` : null,
                        `${p.reports_per_period} full ${p.reports_per_period === 1 ? "analysis" : "analyses"} a month`,
                        p.sites_limit && p.sites_limit > 1 ? `up to ${p.sites_limit} sites` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Button
                  className="w-full"
                  variant={selected || (!ent?.active && !creditOnly) ? "default" : "outline"}
                  disabled={busy === p.polar_product_id || current}
                  onClick={() => subscribe(p.polar_product_id, p.name)}
                >
                  {current ? (
                    "You're on this plan"
                  ) : busy === p.polar_product_id ? (
                    <LogoLoader size={16} />
                  ) : (
                    <>
                      {p.one_time
                        ? "Buy single report"
                        : ent?.active
                          ? "Switch plan"
                          : selected
                            ? `Continue with ${p.name}`
                            : "Subscribe"}
                      <ArrowRight className="size-4" aria-hidden />
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Payments, VAT/sales tax and invoices are handled by Polar (merchant of record). Failed analyses never
        count against your quota. Your reports stay in your account even if you cancel.
      </p>
    </div>
  );
}
