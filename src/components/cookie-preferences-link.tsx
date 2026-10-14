"use client";

import { clearConsentForReask } from "@/lib/consent";
import { useI18n } from "@/i18n/provider";

/**
 * Footer control that re-opens the cookie banner so visitors can change
 * their Accept/Reject choice at any time (GDPR-style self-service).
 */
export function CookiePreferencesLink() {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={clearConsentForReask}
      className="inline-block py-1 text-start hover:text-foreground pointer-coarse:min-h-11"
    >
      {t("footer.cookiePrefs")}
    </button>
  );
}
