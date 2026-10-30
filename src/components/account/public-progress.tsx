"use client";

import Link from "next/link";
import { ArrowRight, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BrandedPage, PrivateNote } from "@/components/agency/client-portal";
import { useI18n } from "@/i18n/provider";
import type { SiteProgress } from "@/lib/account/progress";
import type { Brand } from "@/lib/agency/types";
import { ProgressCard } from "./progress-card";

export interface PublicShareView {
  owner: { name: string | null; avatarUrl: string | null };
  site: SiteProgress;
  /** Set when an agency workspace shared it: its branding instead of Olmene's, and no sign-up pitch. */
  brand?: Brand | null;
}

/**
 * /p/[slug]/: one site's progress, shared by its owner. The card, a line on
 * what stays private, and an invitation to check your own site. A link that
 * was turned off (or never existed) says so plainly and points home.
 */
export function PublicProgress({ share }: { share: PublicShareView | null }) {
  const { t } = useI18n();
  if (share?.brand) {
    const { brand } = share;
    return (
      <BrandedPage brand={brand}>
        <div className="mx-auto grid w-full max-w-2xl gap-6">
          {brand.name && <p className="o-eyebrow text-center">{t("portal.preparedBy", { agency: brand.name })}</p>}
          <ProgressCard site={share.site} owner={share.owner} />
          <PrivateNote brand={brand} />
        </div>
      </BrandedPage>
    );
  }
  return (
    <div className="relative isolate flex min-h-screen flex-col">
      <div aria-hidden className="o-hero-backdrop pointer-events-none absolute inset-x-0 top-0 -z-10 h-[70vh]" />
      <SiteHeader />
      <main id="main-content" className="flex-1 px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
        {share ? (
          <div className="mx-auto grid w-full max-w-2xl gap-8">
            <ProgressCard site={share.site} owner={share.owner} />
            <PrivateNote brand={null} />
            <section className="o-well grid justify-items-center gap-4 rounded-2xl px-6 py-9 text-center">
              <h2 className="o-display text-[26px] leading-tight sm:text-[30px]">{t("share.cta.title")}</h2>
              <p className="max-w-md text-[15px] leading-relaxed text-muted-foreground">{t("share.cta.body")}</p>
              <Button asChild size="xl" className="mt-2">
                <Link href="/#free-diagnosis">
                  {t("share.cta.button")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
                </Link>
              </Button>
            </section>
          </div>
        ) : (
          <div className="mx-auto grid max-w-md justify-items-center gap-4 py-16 text-center">
            <span className="grid size-14 place-items-center rounded-2xl border border-rim bg-secondary">
              <Link2Off className="size-6" aria-hidden />
            </span>
            <h1 className="o-display text-[28px] leading-tight">{t("share.notFound.title")}</h1>
            <p className="text-[15px] leading-relaxed text-muted-foreground">{t("share.notFound.body")}</p>
            <Button asChild size="xl" className="mt-3">
              <Link href="/">{t("share.notFound.cta")}</Link>
            </Button>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
