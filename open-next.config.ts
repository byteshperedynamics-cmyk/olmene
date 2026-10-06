import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Prerendered pages are served straight from Workers static assets instead of
// being re-rendered on every request, which is what the old "dummy" cache did
// (on 2026-10-06 that per-request rendering ended in Worker errors 1101/1102
// and hung pages under load). The site has no ISR or revalidation, so a
// read-only cache fits: pages are as fresh as the last deploy.
//
// The cache is copied into the assets at deploy time by the `build.command`
// in wrangler.jsonc (and by `opennextjs-cloudflare deploy`). Without that copy
// the Worker falls back to rendering.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
