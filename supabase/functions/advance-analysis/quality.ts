/**
 * Claim checks (engine v2): every number in a market claim must appear in a
 * source the claim cites. The model only sees source snippets, so a number
 * that isn't in any cited snippet was misremembered or invented. Such claims
 * stay in the report (the reasoning may still be useful) but are flagged
 * `verified: false`, market size confidence drops to "low", and the report's
 * meta.quality counts them. Language-neutral: flags, not appended text.
 */

export interface SourceLite {
  id: string;
  snippet?: string | null;
  content?: string | null;
  title?: string | null;
}

/** Numbers that carry a claim: not years, not single digits. "4,2" and "4.2" are the same number. */
export function claimNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\d[\d\s.,]*\d|\d/g)) {
    const raw = m[0].replace(/\s/g, "");
    const n = raw.replace(/,(?=\d{3}(\D|$))/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const value = Number(n);
    if (!Number.isFinite(value)) continue;
    if (/^(19|20)\d{2}$/.test(n)) continue; // years
    if (value < 10 && !n.includes(".")) continue; // "3 trends", "5 tips"
    out.push(n.replace(/\.0+$/, ""));
  }
  return [...new Set(out)];
}

function sourceText(s: SourceLite): string {
  return `${s.title ?? ""} ${s.snippet ?? ""} ${s.content ?? ""}`;
}

/** True when every claim number appears in at least one cited source (no numbers: nothing to check). */
export function numbersBacked(claim: string, sourceIds: string[], sources: Map<string, SourceLite>): boolean | null {
  const nums = claimNumbers(claim);
  if (!nums.length) return null;
  const texts = sourceIds.map((id) => sources.get(id)).filter((s): s is SourceLite => !!s).map((s) => claimNumbers(sourceText(s)));
  if (!texts.length) return false;
  const pool = new Set(texts.flat());
  return nums.every((n) => pool.has(n));
}

// deno-lint-ignore no-explicit-any
type Market = { size?: any; trends?: any[] };

export function checkMarketClaims(market: Market, sources: SourceLite[]): { market: Market; checked: number; unverified: number } {
  const byId = new Map(sources.map((s) => [s.id, s]));
  let checked = 0;
  let unverified = 0;
  const out: Market = { ...market };
  if (market.size) {
    const ok = numbersBacked(`${market.size.value ?? ""}`, market.size.sourceIds ?? [], byId);
    if (ok !== null) {
      checked++;
      if (!ok) unverified++;
      out.size = { ...market.size, verified: ok, ...(ok ? {} : { confidence: "low" }) };
    }
  }
  if (Array.isArray(market.trends)) {
    out.trends = market.trends.map((t) => {
      const ok = numbersBacked(`${t.trend ?? ""}`, t.sourceIds ?? [], byId);
      if (ok === null) return t;
      checked++;
      if (!ok) unverified++;
      return { ...t, verified: ok };
    });
  }
  return { market: out, checked, unverified };
}

/** Numbers in `text` that come from a market claim flagged unverified (the headline repeating a figure its sources don't contain). */
export function unverifiedNumbersIn(text: string, market: Market): string[] {
  const flagged = new Set<string>();
  if (market.size?.verified === false) for (const n of claimNumbers(`${market.size.value ?? ""}`)) flagged.add(n);
  for (const t of market.trends ?? []) if (t?.verified === false) for (const n of claimNumbers(`${t.trend ?? ""}`)) flagged.add(n);
  return claimNumbers(text).filter((n) => flagged.has(n));
}
