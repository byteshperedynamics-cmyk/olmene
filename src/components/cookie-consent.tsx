"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/provider";
import {
  CONSENT_OPEN_EVENT,
  ensureGaQueued,
  expireGaCookies,
  onQuietPage,
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
    // New users (no stored choice) always see the banner, except on quiet pages (agency clients, invitation links).
    if (readConsent() === null && !onQuietPage()) setOpen(true);
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
      className="fixed bottom-3 end-3 z-50 w-[calc(100%-1.5rem)] max-w-[340px] pb-[env(safe-area-inset-bottom)] print:hidden motion-safe:animate-in fade-in slide-in-from-bottom-2 duration-300 sm:bottom-4 sm:end-4"
    >
      <div className="o-artifact o-glass rounded-xl p-4 backdrop-blur">
        <div className="flex flex-col gap-3">
          <div className="min-w-0 space-y-1">
            <h2 id="cookie-consent-title" className="text-[13px] font-semibold text-foreground">
              {t("cookie.title")}
            </h2>
            <p id="cookie-consent-desc" className="text-[12.5px] leading-relaxed text-muted-foreground">
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
            <Button size="sm" className="h-10 flex-1 px-3 sm:h-8" onClick={accept}>
              {t("cookie.accept")}
            </Button>
            <Button size="sm" className="h-10 flex-1 px-3 sm:h-8" variant="outline" onClick={reject}>
              {t("cookie.reject")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
