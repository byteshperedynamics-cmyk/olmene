/**
 * Lab speed (engine v2): Google PageSpeed Insights, mobile, performance only.
 * Most small sites have too little Chrome traffic for real-user (CrUX) data,
 * so the report's speed facts were empty for them. Free with an API key
 * (PSI_API_KEY, or the CRUX_API_KEY when the same Google Cloud key has the
 * PageSpeed Insights API enabled). Slow (10–40 s): reports only.
 */

export interface LabSpeed {
  source: "pagespeed-lab";
  performance: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
}

// deno-lint-ignore no-explicit-any
export function parsePsi(body: any): LabSpeed | null {
  const lh = body?.lighthouseResult;
  if (!lh) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const audit = (id: string) => num(lh.audits?.[id]?.numericValue);
  const score = num(lh.categories?.performance?.score);
  return {
    source: "pagespeed-lab",
    performance: score === null ? null : Math.round(score * 100),
    lcpMs: audit("largest-contentful-paint") === null ? null : Math.round(audit("largest-contentful-paint")!),
    cls: audit("cumulative-layout-shift") === null ? null : Math.round(audit("cumulative-layout-shift")! * 1000) / 1000,
    tbtMs: audit("total-blocking-time") === null ? null : Math.round(audit("total-blocking-time")!),
  };
}

export async function labSpeed(url: string, timeoutMs = 45_000): Promise<{ speed: LabSpeed; ms: number } | null> {
  const key = Deno.env.get("PSI_API_KEY") ?? Deno.env.get("CRUX_API_KEY");
  if (!key) return null;
  const started = Date.now();
  try {
    const q = new URLSearchParams({ url, strategy: "mobile", category: "performance", key });
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    const speed = parsePsi(await res.json());
    return speed ? { speed, ms: Date.now() - started } : null;
  } catch {
    return null;
  }
}
