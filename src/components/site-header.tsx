"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSelector } from "@/components/language-selector";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n/provider";

/**
 * Jump nav — the landing page is ~12 sections deep, so decided buyers get
 * straight to Pricing/FAQ from any page. Anchor hrefs ("/#…") work from
 * every route. The language selector lives here (and in the footer), never
 * in the hero — the H1 owns the first second.
 */
const NAV = [
  { href: "/#how-it-works", label: "nav.howItWorks" },
  { href: "/#teardown", label: "nav.proof" },
  { href: "/pricing/", label: "nav.pricing" },
  { href: "/#faq", label: "nav.faq" },
  { href: "/security/", label: "nav.security" },
  { href: "/sample-report/", label: "nav.sampleReport" },
];

export function SiteHeader() {
  const { session, loading, loggedIn, signOut } = useSession();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  // Escape closes the mobile menu, like any other disclosure.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 print:hidden">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-5 lg:flex" aria-label={t("nav.main")}>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {t(n.label)}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="hidden md:block">
            <LanguageSelector size="sm" />
          </div>
          <ThemeToggle />
          {loading ? null : loggedIn ? (
            <>
              <Button asChild size="sm">
                <Link href="/app/">{t("common.dashboard")}</Link>
              </Button>
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={() => signOut()}>
                {t("common.signOut")}
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/login/">{t("common.signIn")}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/login/">{t("common.getStarted")}</Link>
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-expanded={open}
            aria-label={t("common.toggleMenu")}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
        </div>
      </div>
      {open && (
        <div className="border-t border-border/70 bg-background lg:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3" aria-label={t("nav.mobile")}>
            <div className="py-1.5 md:hidden">
              <LanguageSelector size="sm" />
            </div>
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="rounded-md px-2 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => setOpen(false)}
              >
                {t(n.label)}
              </Link>
            ))}
            {!loggedIn && !loading && (
              <Link
                href="/login/"
                className="rounded-md px-2 py-2.5 text-sm font-medium text-primary hover:bg-accent"
                onClick={() => setOpen(false)}
              >
                {t("common.signIn")}
              </Link>
            )}
          </nav>
        </div>
      )}
      {/* keep session referenced for future use (avatar etc.) */}
      <span className="hidden">{session?.user?.email}</span>
    </header>
  );
}
