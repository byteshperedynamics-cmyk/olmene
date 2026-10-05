"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import {
  CONSENT_OPEN_EVENT,
  ensureGaQueued,
  expireGaCookies,
  pushConsentUpdate,
  readConsent,
  storeConsent,
} from "@/lib/consent";

/**
 * Cookie consent banner — pops up for every new visitor (no stored choice),
 * with a real Accept / Reject decision. Accept loads Google Analytics;
 * Reject keeps every Google resource off the page. The choice is remembered
 * and can be changed any time via "Cookie preferences" in the footer.
 */
export function CookieConsent() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // New users (no stored choice) always see the banner.
    if (readConsent() === null) setOpen(true);
    const onOpen = () => setOpen(true);
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
  }, []);

  if (!open) return null;

  const accept = () => {
    pushConsentUpdate("granted");
    ensureGaQueued();
    storeConsent("accepted");
    setOpen(false);
  };

  const reject = () => {
    pushConsentUpdate("denied");
    expireGaCookies();
    storeConsent("rejected");
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-desc"
      className="fixed inset-x-0 bottom-0 z-50 p-3 sm:start-auto sm:p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] print:hidden motion-safe:animate-in fade-in slide-in-from-bottom-4 duration-300"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-background/95 p-4 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-background/90 sm:mx-0 sm:max-w-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="min-w-0 space-y-1.5">
            <h2 id="cookie-consent-title" className="font-display text-base font-semibold text-foreground">
              {t("cookie.title")}
            </h2>
            <p id="cookie-consent-desc" className="text-sm leading-relaxed text-muted-foreground">
              {t("cookie.body")}{" "}
              <Link
                href="/legal/privacy/"
                className="font-medium underline underline-offset-4 hover:text-foreground"
              >
                {t("footer.privacy")}
              </Link>
            </p>
          </div>
          <div className="flex shrink-0 flex-row gap-2">
            <Button size="sm" className="h-11 flex-1 px-5 sm:h-9 sm:px-3" onClick={accept}>
              {t("cookie.accept")}
            </Button>
            <Button size="sm" className="h-11 flex-1 px-5 sm:h-9 sm:px-3" variant="outline" onClick={reject}>
              {t("cookie.reject")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
