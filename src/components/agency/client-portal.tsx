"use client";

import Link from "next/link";
import { ArrowUpRight, Link2Off, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressCard } from "@/components/account/progress-card";
import { useI18n } from "@/i18n/provider";
import type { Brand, PortalView } from "@/lib/agency/types";
import { cn } from "@/lib/utils";

/**
 * The agency's name, logo and colour across the top of a page its clients
 * see. Logos sit on a white plate in dark mode, so a dark logo made for
 * white paper stays readable. `compact` is the size used in previews.
 */
export function BrandBar({ brand, compact = false }: { brand: Brand; compact?: boolean }) {
  const { t } = useI18n();
  if (!brand.name && !brand.logoUrl) return null;
  return (
    <div className="grid gap-0">
      <div aria-hidden className="h-1 w-full" style={{ background: brand.color ?? "var(--foreground)" }} />
      <div className={cn("mx-auto flex w-full items-center justify-between gap-4", compact ? "px-4 py-2.5" : "max-w-5xl px-4 py-4 sm:px-6")}>
        {/* The logo stands for the name (most logos already say it); the name alone when there's no logo. */}
        {brand.logoUrl ? (
          <span className="flex min-w-0 shrink-0 items-center rounded-md dark:bg-white dark:px-1.5 dark:py-1">
            <img src={brand.logoUrl} alt={brand.name ?? ""} className={cn("w-auto object-contain", compact ? "h-6 max-w-[7rem]" : "h-8 max-w-[10rem] sm:h-9 sm:max-w-[12rem]")} />
          </span>
        ) : (
          <span className={cn("min-w-0 truncate font-semibold", compact ? "text-[13px]" : "text-[16px]")}>{brand.name}</span>
        )}
        {brand.url && brand.name ? (
          <a
            href={brand.url}
            rel="noopener"
            className={cn(
              "o-hit flex shrink-0 items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline",
              compact ? "text-[11px]" : "text-[13.5px]",
            )}
          >
            {t("portal.visit", { agency: brand.name })} <ArrowUpRight className={compact ? "size-3" : "size-3.5"} aria-hidden />
          </a>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A page an agency's clients see: its brand bar on top, "Measured with
 * Olmene" at the foot unless white-labelled. Marked data-agency-page, so
 * Olmene's cookie banner and analytics stay off it.
 */
export function BrandedPage({ brand, children }: { brand: Brand; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col" data-agency-page="">
      <BrandBar brand={brand} />
      <main id="main-content" className="flex-1 px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        {children}
      </main>
      {!brand.whiteLabel && (
        <footer className="pb-8 text-center">
          {/* A full page load, so olmene.com starts fresh (with its cookie banner). */}
          <a href="/" className="text-[12.5px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {t("portal.powered")}
          </a>
        </footer>
      )}
    </div>
  );
}

/** The line under shared progress: what stays private, and who keeps it so. */
export function PrivateNote({ brand }: { brand: Brand | null }) {
  const { t } = useI18n();
  return (
    <p className="flex items-start justify-center gap-2 text-center text-[13px] text-muted-foreground">
      <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {brand?.name ? t("portal.private", { agency: brand.name }) : t("share.private")}
    </p>
  );
}

/**
 * /c/[slug]/: one client's websites, as their agency shares them: the
 * agency's branding, a progress card per site, and a line on what stays
 * private. "Measured with Olmene" unless the agency's plan hides it.
 */
export function ClientPortal({ view }: { view: PortalView | null }) {
  const { t } = useI18n();
  if (!view) {
    return (
      <main id="main-content" className="flex min-h-screen items-center justify-center px-4">
        <div className="grid max-w-md justify-items-center gap-4 py-16 text-center">
          <span className="grid size-14 place-items-center rounded-2xl border border-rim bg-secondary">
            <Link2Off className="size-6" aria-hidden />
          </span>
          <h1 className="o-display text-[28px] leading-tight">{t("share.notFound.title")}</h1>
          <p className="text-[15px] leading-relaxed text-muted-foreground">{t("share.notFound.body")}</p>
          <Button asChild size="xl" className="mt-3">
            <Link href="/">{t("share.notFound.cta")}</Link>
          </Button>
        </div>
      </main>
    );
  }
  const { brand, client, sites } = view;
  return (
    <BrandedPage brand={brand}>
      <div className="mx-auto grid w-full max-w-5xl gap-8">
        <header className="grid gap-2">
          {brand.name && <p className="o-eyebrow">{t("portal.preparedBy", { agency: brand.name })}</p>}
          <h1 className="o-display text-balance text-[30px] leading-tight sm:text-[38px]">{t("portal.title", { client: client.name })}</h1>
          <p className="text-[15px] text-muted-foreground">{t("portal.body")}</p>
        </header>
        {sites.length ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {sites.map((s) => (
              <ProgressCard key={s.siteId} site={s} owner={{ name: null, avatarUrl: null }} title={s.host} />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-[15px] text-muted-foreground">{t("portal.empty")}</p>
        )}
        <PrivateNote brand={brand} />
      </div>
    </BrandedPage>
  );
}
