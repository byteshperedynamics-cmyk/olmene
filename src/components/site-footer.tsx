"use client";

import Link from "next/link";
import { Logo } from "@/components/logo";
import { CookiePreferencesLink } from "@/components/cookie-preferences-link";
import { LanguageSelector } from "@/components/language-selector";
import { useI18n } from "@/i18n/provider";

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-border/70 bg-secondary/30 print:hidden">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div className="space-y-3">
            <Logo />
            <p className="max-w-xs text-sm text-muted-foreground">{t("footer.tagline")}</p>
          </div>
          <nav className="space-y-3" aria-label={t("footer.product")}>
            <p className="text-sm font-semibold">{t("footer.product")}</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><Link className="inline-block py-1 hover:text-foreground" href="/pricing/">{t("nav.pricing")}</Link></li>
              <li><Link className="inline-block py-1 hover:text-foreground" href="/sample-report/">{t("nav.sampleReport")}</Link></li>
              <li><Link className="inline-block py-1 hover:text-foreground" href="/login/">{t("common.signIn")}</Link></li>
            </ul>
          </nav>
          <nav className="space-y-3" aria-label={t("footer.legal")}>
            <p className="text-sm font-semibold">{t("footer.legal")}</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><Link className="inline-block py-1 hover:text-foreground" href="/legal/terms/">{t("footer.terms")}</Link></li>
              <li><Link className="inline-block py-1 hover:text-foreground" href="/legal/privacy/">{t("footer.privacy")}</Link></li>
              <li><CookiePreferencesLink /></li>
            </ul>
          </nav>
          <nav className="space-y-3" aria-label={t("footer.reports")}>
            <p className="text-sm font-semibold">{t("footer.reports")}</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>{t("footer.r1")}</li>
              <li>{t("footer.r2")}</li>
              <li>{t("footer.r3")}</li>
            </ul>
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{t("footer.copyright", { year: new Date().getFullYear() })}</p>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <p className="whitespace-nowrap font-mono">{t("footer.motto")}</p>
            <LanguageSelector size="sm" up />
          </div>
        </div>
      </div>
    </footer>
  );
}
