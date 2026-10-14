/**
 * "Your site, live" (engine v2): a screenshot of the scanned page's first
 * screen plus pins on the elements the checks talk about, so the result can
 * show findings on the visitor's own page instead of a generic mockup.
 *
 * capture() runs after the scan answers (EdgeRuntime.waitUntil or the open
 * stream); the saved scan gets `shot` when it's ready. Optional: needs
 * Cloudflare Browser Rendering (CF_ACCOUNT_ID + CF_BROWSER_TOKEN).
 */
import { type ScrapedElement, scrapeElements, screenshotPage, type Viewport } from "../_shared/render.ts";

export const SHOT_VIEWPORT: Viewport = { width: 1280, height: 800 };

export interface Pin {
  /** Which check this pin belongs to (checklist label), or a scan stat. */
  check: string;
  kind: "h1" | "cta" | "image-alt" | "pricing" | "form";
  status: "pass" | "warn" | "fail";
  /** Short label for the pin ("No alt text", "Main headline"). */
  label: string;
  text: string | null;
  /** Box in screenshot pixels (same as CSS pixels at SHOT_VIEWPORT). */
  box: { x: number; y: number; w: number; h: number };
}

export interface Shot {
  status: "ready" | "pending" | "unavailable";
  url?: string;
  width?: number;
  height?: number;
  pins?: Pin[];
  capturedAt?: string;
}

interface CheckLite {
  check: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export const SHOT_SELECTORS = ["h1", "a, button, input[type=submit]", "img", "form"];

const visible = (e: ScrapedElement, vp: Viewport) =>
  e.width >= 8 && e.height >= 8 && e.top < vp.height && e.top + e.height > 0 && e.left < vp.width && e.left + e.width > 0;

const clampBox = (e: ScrapedElement, vp: Viewport) => {
  const x = Math.max(0, Math.round(e.left));
  const y = Math.max(0, Math.round(e.top));
  return { x, y, w: Math.round(Math.min(e.width, vp.width - x)), h: Math.round(Math.min(e.height, vp.height - y)) };
};

const attr = (e: ScrapedElement, name: string) => e.attributes?.find((a) => a.name.toLowerCase() === name)?.value;
const norm = (t: string) => t.replace(/\s+/g, " ").trim();

/**
 * Pure: turn scraped elements + the scan's checklist into at most 6 pins on
 * the first screen. Only facts the scan already established are pinned.
 */
export function pinsFrom(
  scraped: Array<{ selector: string; results: ScrapedElement[] }>,
  checklist: CheckLite[],
  ctaButtons: string[],
  vp: Viewport = SHOT_VIEWPORT,
): Pin[] {
  const bySel = new Map(scraped.map((s) => [s.selector, (s.results ?? []).filter((e) => visible(e, vp))]));
  const status = (label: string) => checklist.find((c) => c.check === label)?.status ?? "pass";
  const pins: Pin[] = [];

  const h1 = bySel.get("h1")?.[0];
  if (h1) {
    const st = status("Single H1");
    pins.push({ check: "Single H1", kind: "h1", status: st, label: st === "pass" ? "Main headline" : "Headline issue", text: norm(h1.text).slice(0, 120) || null, box: clampBox(h1, vp) });
  }

  const ctaSet = new Set(ctaButtons.map((c) => norm(c).toLowerCase()));
  const cta = (bySel.get("a, button, input[type=submit]") ?? []).find((e) => ctaSet.has(norm(e.text || attr(e, "value") || "").toLowerCase()));
  const ctaStatus = status("Call-to-action");
  if (cta) {
    pins.push({ check: "Call-to-action", kind: "cta", status: ctaStatus, label: "Call to action", text: norm(cta.text || attr(cta, "value") || "").slice(0, 60) || null, box: clampBox(cta, vp) });
  }

  const pricing = (bySel.get("a, button, input[type=submit]") ?? []).find((e) => /pric|plans?\b|tarif|preis|precio/i.test(`${attr(e, "href") ?? ""} ${e.text}`));
  if (pricing && pins.length < 6) {
    pins.push({ check: "Pricing page", kind: "pricing", status: status("Pricing page"), label: "Pricing link", text: norm(pricing.text).slice(0, 40) || null, box: clampBox(pricing, vp) });
  }

  // Images missing an alt attribute (alt="" is correct for decoration).
  for (const img of (bySel.get("img") ?? []).filter((e) => attr(e, "alt") === undefined && e.width >= 40 && e.height >= 40).slice(0, 2)) {
    if (pins.length >= 6) break;
    pins.push({ check: "Image alt coverage", kind: "image-alt", status: status("Image alt coverage") === "pass" ? "warn" : status("Image alt coverage"), label: "No alt text", text: null, box: clampBox(img, vp) });
  }

  if (!cta && ctaStatus !== "pass" && pins.length < 6) {
    const form = bySel.get("form")?.[0];
    if (form) pins.push({ check: "Call-to-action", kind: "form", status: ctaStatus, label: "Form without a clear action", text: null, box: clampBox(form, vp) });
  }
  return pins;
}

/** Screenshot + pins (two browser sessions in parallel). Null when rendering isn't configured or fails. */
export async function capture(url: string, checklist: CheckLite[], ctaButtons: string[]): Promise<{ jpeg: Uint8Array; pins: Pin[]; ms: number } | null> {
  const [shot, scraped] = await Promise.all([
    screenshotPage(url, SHOT_VIEWPORT),
    scrapeElements(url, SHOT_SELECTORS, SHOT_VIEWPORT).catch(() => null),
  ]);
  if (!shot) return null;
  return { jpeg: shot.bytes, pins: scraped ? pinsFrom(scraped.results, checklist, ctaButtons) : [], ms: shot.ms + (scraped?.ms ?? 0) };
}
