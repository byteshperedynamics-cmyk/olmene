/**
 * Rendered HTML for JavaScript-built pages (React/Vite shells from Lovable,
 * Bolt and friends), through Cloudflare Browser Rendering's /content endpoint.
 * A shell's raw HTML is an empty <div id="root">, so content checks would
 * report "no headline, no CTA, no text" for a page that has all three.
 *
 * Optional: needs CF_ACCOUNT_ID and CF_BROWSER_TOKEN (a token with
 * "Browser Rendering - Edit" / "Browser Run - Edit"). Without them callers get
 * null and must say the content was not measured instead of failing checks.
 * Billing: Workers Paid includes 10 browser hours a month, then $0.09/hour.
 */

export interface RenderResult {
  html: string;
  ms: number;
}

const PATHS = ["browser-rendering", "browser-run"];

export function renderingConfigured(): boolean {
  return !!(Deno.env.get("CF_ACCOUNT_ID") && Deno.env.get("CF_BROWSER_TOKEN"));
}

export async function renderPage(url: string, timeoutMs = 25_000): Promise<RenderResult | null> {
  const account = Deno.env.get("CF_ACCOUNT_ID");
  const token = Deno.env.get("CF_BROWSER_TOKEN");
  if (!account || !token) return null;
  const started = Date.now();
  for (const path of PATHS) {
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}/content`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          // Text and markup are what the checks read; skip the heavy assets.
          rejectResourceTypes: ["image", "media", "font"],
          gotoOptions: { waitUntil: "networkidle2", timeout: Math.max(5_000, timeoutMs - 5_000) },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 404 && path !== PATHS[PATHS.length - 1]) continue; // endpoint renamed: try the next path
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        return null;
      }
      const type = res.headers.get("content-type") ?? "";
      let html = "";
      if (type.includes("application/json")) {
        const body = (await res.json().catch(() => null)) as { success?: boolean; result?: unknown } | null;
        if (body && typeof body.result === "string") html = body.result;
      } else {
        html = await res.text();
      }
      if (html.length < 200) return null;
      return { html: html.slice(0, 4 * 1024 * 1024), ms: Date.now() - started };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * A page whose server HTML is only an app shell: almost no text, a mount
 * point (#root, #app, #__next…) and script bundles. Rendered sites (Next.js
 * SSR, static HTML) have their text in the HTML and are never shells.
 */
export function looksLikeJsShell(html: string, wordCount: number): boolean {
  if (wordCount >= 120) return false;
  const low = html.slice(0, 300_000).toLowerCase();
  const emptyMount = /<div[^>]+id=["'](?:root|app|__nuxt|svelte|main|application)["'][^>]*>\s*<\/div>/.test(low);
  const anyMount = /<div[^>]+id=["'](?:root|app|__nuxt|svelte)["']/.test(low);
  const bundles = (low.match(/<script\b[^>]*(?:type=["']module["']|\bsrc=["'][^"']+\.m?js(?:\?[^"']*)?["'])/g) ?? []).length;
  return emptyMount || (anyMount && bundles >= 1 && wordCount < 80) || (bundles >= 1 && wordCount < 25);
}

// ─── Screenshots and element boxes (engine v2) ───────────────────────────
// Used by the free scan's "your site, live" view: a screenshot of the first
// screen plus the boxes of the elements the checks talk about (H1, calls to
// action, images without alt text), so the UI can pin findings onto the
// visitor's own page. Two browser sessions (~5 s each, in parallel).

export interface Viewport {
  width: number;
  height: number;
}

async function cfBrowser(endpoint: string, body: Record<string, unknown>, timeoutMs: number): Promise<Response | null> {
  const account = Deno.env.get("CF_ACCOUNT_ID");
  const token = Deno.env.get("CF_BROWSER_TOKEN");
  if (!account || !token) return null;
  for (const path of PATHS) {
    try {
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}/${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 404 && path !== PATHS[PATHS.length - 1]) {
        await res.body?.cancel().catch(() => {});
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        return null;
      }
      return res;
    } catch {
      return null;
    }
  }
  return null;
}

/** JPEG of the first screen at the given viewport, or null. */
export async function screenshotPage(url: string, viewport: Viewport, timeoutMs = 25_000): Promise<{ bytes: Uint8Array; ms: number } | null> {
  const started = Date.now();
  const res = await cfBrowser("screenshot", {
    url,
    viewport,
    screenshotOptions: { type: "jpeg", quality: 72, fullPage: false },
    gotoOptions: { waitUntil: "networkidle2", timeout: Math.max(5_000, timeoutMs - 5_000) },
  }, timeoutMs);
  if (!res) return null;
  const type = res.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length < 1_000 || bytes.length > 4 * 1024 * 1024) return null;
  return { bytes, ms: Date.now() - started };
}

export interface ScrapedElement {
  text: string;
  attributes: Array<{ name: string; value: string }>;
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Elements matching each selector, with their boxes in CSS pixels at the viewport. */
export async function scrapeElements(url: string, selectors: string[], viewport: Viewport, timeoutMs = 25_000): Promise<{ results: Array<{ selector: string; results: ScrapedElement[] }>; ms: number } | null> {
  const started = Date.now();
  const res = await cfBrowser("scrape", {
    url,
    viewport,
    elements: selectors.map((selector) => ({ selector })),
    rejectResourceTypes: ["media", "font"],
    gotoOptions: { waitUntil: "networkidle2", timeout: Math.max(5_000, timeoutMs - 5_000) },
  }, timeoutMs);
  if (!res) return null;
  const body = (await res.json().catch(() => null)) as { success?: boolean; result?: Array<{ selector: string; results: ScrapedElement[] }> } | null;
  if (!body?.result || !Array.isArray(body.result)) return null;
  return { results: body.result, ms: Date.now() - started };
}
