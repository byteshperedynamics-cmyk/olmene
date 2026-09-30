"use client";

import { useI18n } from "@/i18n/provider";

/** Keyboard-accessible skip link (a11y) — text follows the active language. */
export function SkipLink() {
  const { t } = useI18n();
  return (
    <a
      href="#main-content"
      className="sr-only z-50 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
    >
      {t("common.skipToContent")}
    </a>
  );
}
