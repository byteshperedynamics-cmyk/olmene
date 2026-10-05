/**
 * Live re-check after merge — the "Verify" step of Find it · Fix it · Prove it.
 *
 * After a fix PR is merged, the cron sync fetches the PUBLIC site and checks
 * that every merged fix is actually live (the deploy may lag the merge, so
 * failures are retried for 24 h). Afterwards it re-checks weekly and flags
 * anything that regressed. Deterministic HTML/HTTP checks only — no LLM, no
 * repository access.
 */

export interface LiveCheckResult {
  fixer: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface LiveCheckRun {
  checkedAt: string;
  siteUrl: string;
  results: LiveCheckResult[];
  passed: number;
  total: number;
  /** Fixers that passed in the previous run but fail now. */
  regressed: string[];
  /** Site could not be fetched (results are empty). */
  fetchError?: string;
}

export interface LiveCheckState {
  /** Most recent run. */
  last?: LiveCheckRun;
  /** Compact history, newest first (max 8). */
  history?: Array<{ checkedAt: string; passed: number; total: number }>;
  /** Attempts made in the first 24 h while waiting for the deploy. */
  attempts?: number;
  /** True once the post-merge window is over (then only weekly re-checks). */
  settled?: boolean;
}

export interface AppliedFix {
  fixer_id: string;
  preview: Record<string, unknown> | null;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const UA = "Mozilla/5.0 (compatible; OlmeneBot/1.0; +https://olmene.com)";
const MAX_HTML_BYTES = 3 * 1024 * 1024;

const LABELS: Record<string, string> = {
  "meta-description": "Meta description",
  "canonical-url": "Canonical URL",
  "json-ld-org": "Structured data (JSON-LD)",
  "sitemap-robots": "robots.txt and sitemap.xml",
  "image-alt": "Image alt text",
  "pricing-link": "Pricing link",
  "h1-rewrite": "Homepage headline (H1)",
  "viewport-meta": "Mobile viewport",
  "social-meta": "Social preview tags",
};

/** Timing policy (minutes / days) — exported for tests. */
export const LIVE_CHECK_POLICY = {
  firstCheckAfterMergeMin: 10,
  retryEveryMin: 10,
  settleAfterHours: 24,
  weeklyDays: 7,
};

/** Should this merged job be (re-)checked now? */
export function liveCheckDue(mergedAt: string, state: LiveCheckState | undefined, now: Date): boolean {
  const merged = new Date(mergedAt).getTime();
  const t = now.getTime();
  if (t - merged < LIVE_CHECK_POLICY.firstCheckAfterMergeMin * 60_000) return false;
  const last = state?.last ? new Date(state.last.checkedAt).getTime() : null;
  if (last === null) return true;
  const allOk = state!.last!.total > 0 && state!.last!.passed === state!.last!.total;
  const inWindow = t - merged < LIVE_CHECK_POLICY.settleAfterHours * 3_600_000;
  if (!state!.settled && !allOk && inWindow) return t - last >= LIVE_CHECK_POLICY.retryEveryMin * 60_000;
  return t - last >= LIVE_CHECK_POLICY.weeklyDays * 86_400_000;
}

/** Merge a fresh run into the stored state (history, regressions, settling). */
export function nextLiveCheckState(
  prev: LiveCheckState | undefined,
  run: LiveCheckRun,
  mergedAt: string,
  now: Date,
): LiveCheckState {
  const prevOk = new Set((prev?.last?.results ?? []).filter((r) => r.ok).map((r) => r.fixer));
  const regressed = prev?.settled ? run.results.filter((r) => !r.ok && prevOk.has(r.fixer)).map((r) => r.fixer) : [];
  const last: LiveCheckRun = { ...run, regressed };
  const allOk = run.total > 0 && run.passed === run.total;
  const outOfWindow = now.getTime() - new Date(mergedAt).getTime() >= LIVE_CHECK_POLICY.settleAfterHours * 3_600_000;
  return {
    last,
    history: [{ checkedAt: run.checkedAt, passed: run.passed, total: run.total }, ...(prev?.history ?? [])].slice(0, 8),
    attempts: (prev?.attempts ?? 0) + 1,
    settled: prev?.settled || allOk || outOfWindow,
  };
}

// ── HTML helpers (no DOM in the Worker; tag-level regex is enough here) ──

function tags(html: string, name: string): string[] {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) ?? [];
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  if (!m) return null;
  return decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function norm(s: string): string {
  return decodeEntities(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function metaContent(html: string, key: string): string | null {
  for (const t of tags(html, "meta")) {
    const n = (attr(t, "name") ?? attr(t, "property") ?? "").toLowerCase();
    if (n === key) return attr(t, "content");
  }
  return null;
}

/** The value the fix wrote, read from the added lines of the PR diff. */
function addedValue(preview: Record<string, unknown> | null, patterns: RegExp[]): string | null {
  const edits = (preview?.edits as Array<{ diff?: string }> | undefined) ?? [];
  for (const e of edits) {
    for (const line of (e.diff ?? "").split("\n")) {
      if (!line.startsWith("+") || line.startsWith("+++")) continue;
      for (const re of patterns) {
        const m = line.slice(1).match(re);
        if (m?.[1]) return decodeEntities(m[1].replace(/\\"/g, '"')).trim();
      }
    }
  }
  return null;
}

async function fetchText(fetchFn: FetchLike, url: string): Promise<{ status: number; text: string; url: string }> {
  const res = await fetchFn(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(12_000),
  });
  const reader = res.body?.getReader();
  if (!reader) return { status: res.status, text: "", url: res.url || url };
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    const room = MAX_HTML_BYTES - size;
    if (room <= 0) break;
    const part = value.byteLength > room ? value.slice(0, room) : value;
    chunks.push(part);
    size += part.byteLength;
    if (size >= MAX_HTML_BYTES) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  const all = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return { status: res.status, text: new TextDecoder().decode(all), url: res.url || url };
}

async function status(fetchFn: FetchLike, url: string): Promise<number> {
  try {
    const res = await fetchFn(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(8_000) });
    await res.body?.cancel().catch(() => {});
    return res.status;
  } catch {
    return 0;
  }
}

const PRICING_HREF = /pric|plans?\b|preis|tarif|precio|prezz|pre[cç]o|prijs|cennik|hinnat|priser|fiyat|τιμ|цен|料金|价格/i;

/** Check one merged fix against the live homepage HTML. */
async function checkFix(fix: AppliedFix, html: string, origin: string, fetchFn: FetchLike): Promise<LiveCheckResult> {
  const label = LABELS[fix.fixer_id] ?? fix.fixer_id;
  const res = (ok: boolean, detail: string): LiveCheckResult => ({ fixer: fix.fixer_id, label, ok, detail });
  switch (fix.fixer_id) {
    case "meta-description": {
      const live = metaContent(html, "description");
      if (!live) return res(false, "No meta description on the live homepage yet.");
      const expected = addedValue(fix.preview, [
        /name=["']description["'][^>]*content="([^"]+)"/i,
        /name=["']description["'][^>]*content='([^']+)'/i,
        /\bdescription:\s*"((?:[^"\\]|\\.)+)"/,
      ]);
      if (expected && norm(live) !== norm(expected)) {
        return res(false, `Live description differs from the merged one (${live.length} chars live).`);
      }
      return res(live.trim().length >= 50, `Live: “${live.trim().slice(0, 90)}${live.length > 90 ? "…" : ""}” (${live.trim().length} chars).`);
    }
    case "canonical-url": {
      const link = tags(html, "link").find((t) => (attr(t, "rel") ?? "").toLowerCase().split(/\s+/).includes("canonical"));
      const href = link ? attr(link, "href") : null;
      return href ? res(true, `Canonical: ${href}`) : res(false, "No canonical link on the live homepage yet.");
    }
    case "json-ld-org": {
      const blocks = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
      const hasOrg = blocks.some((b) => /"@type"\s*:\s*"Organization"/i.test(b));
      return hasOrg
        ? res(true, `${blocks.length} JSON-LD block${blocks.length === 1 ? "" : "s"} live, including Organization.`)
        : res(false, blocks.length ? "JSON-LD is live but has no Organization entry." : "No JSON-LD on the live homepage yet.");
    }
    case "sitemap-robots": {
      const [r, s] = await Promise.all([status(fetchFn, `${origin}/robots.txt`), status(fetchFn, `${origin}/sitemap.xml`)]);
      const ok = r === 200 && s === 200;
      return res(ok, `robots.txt → ${r || "unreachable"}, sitemap.xml → ${s || "unreachable"}.`);
    }
    case "image-alt": {
      const imgs = tags(html, "img");
      if (!imgs.length) return res(true, "No images on the homepage.");
      const missing = imgs.filter((t) => attr(t, "alt") === null).length;
      return res(missing / imgs.length <= 0.1, `${missing} of ${imgs.length} images have no alt attribute.`);
    }
    case "pricing-link": {
      const found = tags(html, "a").some((t) => PRICING_HREF.test(attr(t, "href") ?? ""));
      return found ? res(true, "A pricing link is live on the homepage.") : res(false, "No pricing link on the live homepage yet.");
    }
    case "h1-rewrite": {
      const h1s = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi) ?? [];
      if (!h1s.length) return res(false, "No <h1> on the live homepage.");
      const expected = addedValue(fix.preview, [/<h1\b[^>]*>([\s\S]*?)<\/h1>/i]);
      if (expected && !h1s.some((h) => norm(h) === norm(expected))) {
        return res(false, `The live headline is not the merged one yet (live: “${norm(h1s[0] ?? "").slice(0, 80)}”).`);
      }
      return res(true, `Live headline: “${norm(h1s[0] ?? "").slice(0, 90)}”.`);
    }
    case "viewport-meta": {
      const live = metaContent(html, "viewport");
      if (!live) return res(false, "No viewport meta tag on the live homepage yet.");
      return res(/width\s*=\s*device-width/i.test(live), `Live viewport: “${live.slice(0, 80)}”.`);
    }
    case "social-meta": {
      const metas = tags(html, "meta");
      const key = (t: string) => (attr(t, "property") ?? attr(t, "name") ?? "").toLowerCase();
      const og = metas.filter((t) => key(t).startsWith("og:")).length;
      const twitter = metas.some((t) => key(t).startsWith("twitter:"));
      return res(og >= 2 && twitter, `${og} og: tag${og === 1 ? "" : "s"} and ${twitter ? "a" : "no"} twitter: tag live.`);
    }
    default:
      return res(true, "Not checkable on the live page (recorded only).");
  }
}

/** Fetch the public homepage once and check every merged fix. */
export async function runLiveCheck(siteUrl: string, fixes: AppliedFix[], fetchFn: FetchLike, now = new Date()): Promise<LiveCheckRun> {
  const base: LiveCheckRun = { checkedAt: now.toISOString(), siteUrl, results: [], passed: 0, total: 0, regressed: [] };
  let page: { status: number; text: string; url: string };
  try {
    page = await fetchText(fetchFn, siteUrl);
  } catch (e) {
    return { ...base, fetchError: e instanceof Error ? e.message.slice(0, 160) : "fetch failed" };
  }
  if (page.status !== 200) return { ...base, fetchError: `HTTP ${page.status}` };
  const origin = new URL(page.url || siteUrl).origin;
  const results: LiveCheckResult[] = [];
  for (const fix of fixes) results.push(await checkFix(fix, page.text, origin, fetchFn));
  return { ...base, results, passed: results.filter((r) => r.ok).length, total: results.length };
}
