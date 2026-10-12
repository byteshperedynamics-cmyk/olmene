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
