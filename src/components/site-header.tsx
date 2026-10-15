"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { LanguageSelector } from "@/components/language-selector";
import { AccountMenu } from "@/components/account/account-menu";
import { identityOf, useProfile } from "@/lib/account-client";
import { useSession } from "@/lib/session";
import { useI18n } from "@/i18n/provider";

/**
 * Floating header pill (DESIGN.md): four links, a globe popover for the 15
 * languages (the list only exists while it is open), sign-in. Light or dark
 * follows the system setting, so there is no theme switch here.
 * Anchor hrefs ("/#…") work from every route.
 */
const NAV = [
  { href: "/#how-it-works", label: "nav.howItWorks" },
  { href: "/sample-report/", label: "nav.sampleReport" },
  { href: "/security/", label: "nav.security" },
  { href: "/business/", label: "nav.business" },
  { href: "/#pricing", label: "nav.pricing" },
];

export function SiteHeader() {
  const { session, loading, loggedIn, signOut } = useSession();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const profile = useProfile(session);
  const identity = identityOf(session, profile.data);

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
    <header className="sticky top-0 z-40 px-3 pt-3 print:hidden">
      <div className="o-glass mx-auto max-w-5xl rounded-2xl border border-rim bg-background/75 shadow-[inset_0_1px_0_var(--edge-top),0_12px_40px_-18px_rgb(0_0_0/0.7)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 w-full items-center justify-between gap-4 ps-4 pe-2.5">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex" aria-label={t("nav.main")}>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-chip hover:text-foreground"
            >
              {t(n.label)}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <div className="hidden md:block">
            <LanguageSelector size="sm" compact />
          </div>
          {loading ? null : loggedIn && identity ? (
            <>
              <Button asChild size="sm">
                <Link href="/app/">{t("common.dashboard")}</Link>
              </Button>
              <AccountMenu
                identity={identity}
                onSignOut={() => signOut({ to: "/login/?signed_out=1" })}
                labels={{
                  menu: t("account.menu"),
                  dashboard: t("common.dashboard"),
                  account: t("account.settings"),
                  share: t("account.share"),
                  billing: t("account.billing"),
                  help: t("account.help"),
                  signOut: t("common.signOut"),
                  addName: t("account.addName"),
                }}
              />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/login/">{t("common.signIn")}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/login/?mode=signup">{t("common.getStarted")}</Link>
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
        <div className="border-t border-edge lg:hidden">
          <nav className="flex flex-col gap-1 px-3 py-3" aria-label={t("nav.mobile")}>
            <div className="py-1.5 md:hidden">
              <LanguageSelector size="sm" compact />
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
                className="rounded-md px-2 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
                onClick={() => setOpen(false)}
              >
                {t("common.signIn")}
              </Link>
            )}
          </nav>
        </div>
      )}
      </div>
    </header>
  );
}
