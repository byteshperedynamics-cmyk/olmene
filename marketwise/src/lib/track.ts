/**
 * Funnel instrumentation — GA4 custom events via the consent-gated gtag.
 *
 * `window.gtag` is defined by the inline CONSENT_BOOT script in analytics.tsx
 * (dataLayer push). Before the visitor accepts cookies, events queue in
 * dataLayer and are dropped by Consent Mode — zero Google traffic for
 * non-consenting visitors, by design.
 *
 * Funnel: landing (page_view, automatic)
 *   → audit_start → audit_complete → pricing_view → checkout_start → purchase
 */

type TrackParams = Record<string, string | number | boolean | undefined>;

export function track(name: string, params?: TrackParams) {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag === "function") gtag("event", name, params ?? {});
}
