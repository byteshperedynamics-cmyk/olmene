"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { useI18n } from "@/i18n/provider";
import { Flower } from "./flower";

/** Branded 404: says what happened and offers the two useful next steps. */
export function NotFoundView() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main-content" className="relative flex flex-1 items-center overflow-hidden">
        <div aria-hidden className="o-grid-bg pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(60%_60%_at_50%_40%,black,transparent)]" />
        <div className="mx-auto grid w-full max-w-xl justify-items-center gap-5 px-4 py-24 text-center">
          <Flower size={44} variant="bloom-once" />
          <p className="o-readout text-faint">404</p>
          <h1 className="o-display text-[36px] leading-[1.08] sm:text-[44px]">{t("nf.title")}</h1>
          <p className="max-w-md text-[16px] leading-relaxed text-muted-foreground">{t("nf.body")}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Button asChild variant="sheen" size="xl">
              <Link href="/">
                {t("nf.scan")} <ArrowRight className="size-4 rtl-flip" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="hairline" size="xl">
              <Link href="/sample-report/">{t("nf.sample")}</Link>
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
