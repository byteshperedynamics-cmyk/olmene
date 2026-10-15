/**
 * Analytics consent state — client-side only helpers.
 *
 * Flow: every visitor WITHOUT a stored choice sees the cookie banner
 * (Accept / Reject). Nothing from Google Analytics loads until they accept.
 * The choice is remembered in localStorage and can be changed any time via
 * "Cookie preferences" in the footer.
 */
import { GA_MEASUREMENT_ID } from "@/lib/config";

export type ConsentValue = "accepted" | "rejected";

export const CONSENT_STORAGE_KEY = "mw-analytics-consent";
/** window event fired whenever the stored choice changes (or is cleared for re-ask). */
export const CONSENT_CHANGED_EVENT = "mw-consent-changed";
/** window event fired when the footer asks the banner to re-open. */
export const CONSENT_OPEN_EVENT = "mw-consent-open";

/**
 * Pages with no cookie banner and no analytics. Pages an agency sends its
 * clients (/c/…, progress links an agency shares, report unsubscribes) mark
 * themselves data-agency-page: those visitors are the agency's clients, not
 * ours. Pages whose address carries a secret (an invitation link) mark
 * themselves data-private-page, so the secret never reaches Google.
 */
export function onQuietPage(): boolean {
  return typeof document !== "undefined" && !!document.querySelector("[data-agency-page], [data-private-page]");
}

/** Query parameters that carry secrets (invitation and unsubscribe tokens). */
const SECRET_PARAMS = ["t", "token"];

/** The page address as analytics may see it: secrets stripped. */
export function analyticsLocation(href: string): string {
  try {
    const u = new URL(href);
    for (const k of SECRET_PARAMS) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return href.split("?")[0];
  }
}

export function readConsent(): ConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return v === "accepted" || v === "rejected" ? v : null;
  } catch {
    return null; // storage blocked (private mode) → treat as "not chosen yet"
  }
}

export function storeConsent(value: ConsentValue) {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, value);
  } catch {
    /* storage blocked — banner will simply re-appear next visit */
  }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: value }));
}

export function clearConsentForReask() {
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CONSENT_OPEN_EVENT));
}

/** Push a consent-mode update through the global gtag shim (no-op if absent). */
export function pushConsentUpdate(analyticsStorage: "granted" | "denied") {
  const w = window as unknown as { gtag?: (...args: unknown[]) => void };
  w.gtag?.("consent", "update", { analytics_storage: analyticsStorage });
}

/**
 * Queue gtag('js') + gtag('config') exactly once, in the right order AFTER the
 * consent update, so the first page_view is measured with the granted state.
 */
export function ensureGaQueued() {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __mwGaQueued?: boolean; gtag?: (...args: unknown[]) => void };
  if (w.__mwGaQueued || !w.gtag) return;
  w.__mwGaQueued = true;
  w.gtag("js", new Date());
  w.gtag("config", GA_MEASUREMENT_ID, { page_location: analyticsLocation(window.location.href) });
}

/** Remove any _ga* cookies the visitor may have from a previous acceptance. */
export function expireGaCookies() {
  if (typeof document === "undefined") return;
  const host = location.hostname;
  for (const raw of document.cookie.split(";")) {
    const name = raw.split("=")[0]?.trim();
    if (!name?.startsWith("_ga")) continue;
    const expired = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    document.cookie = `${expired}; path=/`;
    document.cookie = `${expired}; path=/; domain=${host}`;
    document.cookie = `${expired}; path=/; domain=.${host}`;
  }
}
