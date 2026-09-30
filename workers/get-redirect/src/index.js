/**
 * Legacy domain redirect — get.marketwiselabs.workers.dev → olmene.com
 *
 * The MarketWise app moved to olmene.com (2026-10). This tiny worker keeps
 * the old workers.dev URL alive, 301-redirecting every path (and query
 * string) to the new domain. Keep deployed for at least 12 months so old
 * links, emails and bookmarks keep working.
 *
 * Deploy (from repo root):
 *   CLOUDFLARE_API_KEY=... CLOUDFLARE_EMAIL=... \
 *     npx wrangler deploy --config workers/get-redirect/wrangler.jsonc
 */

const NEW_ORIGIN = "https://olmene.com";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    return Response.redirect(NEW_ORIGIN + url.pathname + url.search, 301);
  },
};
