"use client";

import Link from "next/link";
import { Logo } from "@/components/logo";
import { CookiePreferencesLink } from "@/components/cookie-preferences-link";
import { LanguageSelector } from "@/components/language-selector";
import { useI18n } from "@/i18n/provider";
import { FOUNDER_LINKEDIN, STUDIO_GITHUB, STUDIO_NAME, SUPPORT_EMAIL } from "@/lib/config";

// Touch screens: each link is a 44 px row (Apple HIG minimum target).
const linkClass = "inline-block py-1 hover:text-foreground pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:items-center pointer-coarse:py-0";

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className={linkClass} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function SiteFooter() {
  const { t } = useI18n();
  // "Olmene is built and operated by {studio}." — split so the studio name is the link in any word order.
  const [beforeStudio, afterStudio = ""] = t("footer.operated").split("{studio}");
  return (
    <footer className="border-t border-edge print:hidden">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]">
          <div className="space-y-3 sm:col-span-2 md:col-span-1">
            <Logo />
            <p className="max-w-xs text-sm text-muted-foreground">{t("footer.tagline")}</p>
          </div>
          <nav className="space-y-3" aria-label={t("footer.product")}>
            <p className="text-sm font-semibold">{t("footer.product")}</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><Link className={linkClass} href="/#how-it-works">{t("nav.howItWorks")}</Link></li>
              <li><Link className={linkClass} href="/pricing/">{t("nav.pricing")}</Link></li>
              <li><Link className={linkClass} href="/sample-report/">{t("nav.sampleReport")}</Link></li>
              <li><Link className={linkClass} href="/login/">{t("common.signIn")}</Link></li>
            </ul>
          </nav>
          <nav className="space-y-3" aria-label={t("footer.trust")}>
            <p className="text-sm font-semibold">{t("footer.trust")}</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><Link className={linkClass} href="/security/">{t("footer.security")}</Link></li>
              <li><Link className={linkClass} href="/security/#data">{t("footer.dataHandling")}</Link></li>
              <li><Link className={linkClass} href="/legal/privacy/">{t("footer.privacy")}</Link></li>
              <li><Link className={linkClass} href="/legal/terms/">{t("footer.terms")}</Link></li>
              <li><CookiePreferencesLink /></li>
            </ul>
          </nav>
          <nav className="space-y-3" aria-label={t("footer.company")}>
            <p className="text-sm font-semibold">{t("footer.company")}</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><Link className={linkClass} href="/#about">{t("footer.about")}</Link></li>
              <li><External href={FOUNDER_LINKEDIN}>{STUDIO_NAME}</External></li>
              {SUPPORT_EMAIL && (
                <li><a className={linkClass} href={`mailto:${SUPPORT_EMAIL}`}>{t("footer.contact")}</a></li>
              )}
            </ul>
          </nav>
          <nav className="space-y-3" aria-label={t("footer.connect")}>
            <p className="text-sm font-semibold">{t("footer.connect")}</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li><External href={FOUNDER_LINKEDIN}>LinkedIn</External></li>
              <li><External href={STUDIO_GITHUB}>GitHub</External></li>
            </ul>
          </nav>
        </div>
        <div className="mt-10 flex flex-col gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p>
              {beforeStudio}
              <a translate="no" href={FOUNDER_LINKEDIN} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground/80 underline-offset-4 hover:underline">
                {STUDIO_NAME}
              </a>
              {afterStudio}
            </p>
            <p>{t("footer.copyright", { year: new Date().getFullYear() })}</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <p className="whitespace-nowrap font-mono">{t("footer.motto")}</p>
            <LanguageSelector size="sm" up />
          </div>
        </div>
      </div>
    </footer>
  );
}
