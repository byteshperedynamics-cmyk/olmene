/**
 * Outcome attribution for merged fixes (brief §6.4). Pure functions, no I/O.
 *
 * Method (also shown to users under "How we measure"):
 *  - compare the WINDOW days before a merge with the WINDOW days after it,
 *    excluding the merge day; 14-day windows contain each weekday twice, so
 *    weekly seasonality is matched by construction
 *  - delta = after mean − before mean (and % of before)
 *  - confidence from a Welch t-test p-value: high < 0.05, medium < 0.2, low
 *  - fewer than WINDOW post-merge days → "early" (shown as early signal)
 *  - merges within GROUP_DAYS of each other are measured together as one
 *    "combined" outcome from the first merge — credit we cannot separate is
 *    never split
 *  - a growing (or shrinking) site is not a fix effect: when the 28 days
 *    before the merge show a clear linear trend (slope t > 2), the change is
 *    measured against that trend projected forward (delta vs expectedAfterMean)
 *  - daily traffic is autocorrelated (a good day follows a good day), which
 *    makes plain t-tests overconfident; the standard error is inflated by
 *    sqrt((1+r)/(1-r)) for the lag-1 autocorrelation r of the pre-period
 */

export const WINDOW = 14;
export const GROUP_DAYS = 7;
export const PRE_TREND_DAYS = 28;

export interface DailyPoint {
  /** YYYY-MM-DD */
  date: string;
  clicks: number;
}

export interface MergeEvent {
  id: string;
  /** ISO timestamp or YYYY-MM-DD */
  mergedAt: string;
}

export type Confidence = "low" | "medium" | "high";

export interface Outcome {
  ids: string[];
  mergeDate: string;
  status: "early" | "measured" | "combined" | "insufficient";
  beforeMean: number | null;
  afterMean: number | null;
  delta: number | null;
  deltaPct: number | null;
  pValue: number | null;
  confidence: Confidence | null;
  beforeDays: number;
  afterDays: number;
  /** What the after-window would have averaged on the pre-merge trend (null when no clear trend). */
  expectedAfterMean?: number | null;
  /** True when delta/deltaPct are measured against the projected pre-merge trend. */
  trendAdjusted?: boolean;
}

const DAY = 86_400_000;
const toDay = (s: string) => s.slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);

/** Group merges that happened within GROUP_DAYS of the previous one in the group. */
export function groupMerges(merges: MergeEvent[]): Array<{ ids: string[]; mergeDate: string }> {
  const sorted = [...merges].sort((a, b) => a.mergedAt.localeCompare(b.mergedAt));
  const groups: Array<{ ids: string[]; mergeDate: string; last: string }> = [];
  for (const m of sorted) {
    const day = toDay(m.mergedAt);
    const g = groups[groups.length - 1];
    if (g && (Date.parse(day) - Date.parse(g.last)) / DAY <= GROUP_DAYS) {
      g.ids.push(m.id);
      g.last = day;
    } else {
      groups.push({ ids: [m.id], mergeDate: day, last: day });
    }
  }
  return groups.map(({ ids, mergeDate }) => ({ ids, mergeDate }));
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = (xs: number[], m: number) => xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);

export function measureGroup(series: DailyPoint[], group: { ids: string[]; mergeDate: string }, today: string): Outcome {
  const byDay = new Map(series.map((p) => [p.date, p.clicks]));
  const before: number[] = [];
  const after: number[] = [];
  for (let i = 1; i <= WINDOW; i++) {
    const b = byDay.get(addDays(group.mergeDate, -i));
    if (b !== undefined) before.push(b);
    const day = addDays(group.mergeDate, i);
    if (day <= today) {
      const a = byDay.get(day);
      if (a !== undefined) after.push(a);
    }
  }
  const base: Outcome = {
    ids: group.ids,
    mergeDate: group.mergeDate,
    status: "insufficient",
    beforeMean: null,
    afterMean: null,
    delta: null,
    deltaPct: null,
    pValue: null,
    confidence: null,
    beforeDays: before.length,
    afterDays: after.length,
  };
  if (before.length < 7 || after.length < 3) return base;

  const mb = mean(before);
  const ma = mean(after);
  const status = after.length < WINDOW ? "early" : group.ids.length > 1 ? "combined" : "measured";

  // Pre-merge trend over up to 28 days (x = days relative to the merge).
  const pre: Array<[number, number]> = [];
  for (let i = 1; i <= PRE_TREND_DAYS; i++) {
    const v = byDay.get(addDays(group.mergeDate, -i));
    if (v !== undefined) pre.push([-i, v]);
  }
  const fit = pre.length >= 14 ? linearFit(pre) : null;
  const trended = !!fit && Math.abs(fit.tStat) > 2;
  const afterX: number[] = [];
  for (let i = 1; i <= WINDOW; i++) {
    const d = addDays(group.mergeDate, i);
    if (d <= today && byDay.has(d)) afterX.push(i);
  }
  let beforeResid = before.map((v) => v - mb);
  let afterResid = after.map((v) => v - mb);
  let expected: number | null = null;
  if (trended) {
    const at = (x: number) => fit!.intercept + fit!.slope * x;
    beforeResid = pre.slice(0, WINDOW).map(([x, v]) => v - at(x));
    afterResid = afterX.map((x, k) => after[k] - at(x));
    expected = mean(afterX.map(at));
  }
  const r = lag1Autocorrelation(beforeResid);
  const inflate = r > 0 ? Math.sqrt((1 + Math.min(r, 0.9)) / (1 - Math.min(r, 0.9))) : 1;
  const p = welchPValue(beforeResid, afterResid, inflate);
  const baseline = trended && expected !== null ? expected : mb;
  return {
    ...base,
    status,
    beforeMean: round(mb),
    afterMean: round(ma),
    delta: round(ma - baseline),
    deltaPct: baseline > 0 ? round(((ma - baseline) / baseline) * 100) : null,
    pValue: p === null ? null : Math.round(p * 1000) / 1000,
    confidence: p === null ? "low" : p < 0.05 ? "high" : p < 0.2 ? "medium" : "low",
    expectedAfterMean: expected === null ? null : round(expected),
    trendAdjusted: trended,
  };
}

/** Least-squares line through (x, y) points, with the slope's t statistic. */
export function linearFit(points: Array<[number, number]>): { slope: number; intercept: number; tStat: number } {
  const n = points.length;
  const mx = mean(points.map((p) => p[0]));
  const my = mean(points.map((p) => p[1]));
  let sxx = 0;
  let sxy = 0;
  for (const [x, y] of points) {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  const sse = points.reduce((acc, [x, y]) => acc + (y - (intercept + slope * x)) ** 2, 0);
  const se = n > 2 && sxx > 0 ? Math.sqrt(sse / (n - 2) / sxx) : 0;
  return { slope, intercept, tStat: se > 0 ? slope / se : slope === 0 ? 0 : Infinity };
}

/** Lag-1 autocorrelation of a series (0 when undefined). */
export function lag1Autocorrelation(xs: number[]): number {
  if (xs.length < 4) return 0;
  const m = mean(xs);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    den += (xs[i] - m) ** 2;
    if (i > 0) num += (xs[i] - m) * (xs[i - 1] - m);
  }
  return den === 0 ? 0 : num / den;
}

export function measureAll(series: DailyPoint[], merges: MergeEvent[], today: string): Outcome[] {
  return groupMerges(merges).map((g) => measureGroup(series, g, today));
}

const round = (x: number) => Math.round(x * 10) / 10;

/** Two-sided Welch t-test p-value, or null when variance is degenerate. `inflate` scales the standard error (autocorrelation). */
export function welchPValue(a: number[], b: number[], inflate = 1): number | null {
  if (a.length < 2 || b.length < 2) return null;
  const ma = mean(a);
  const mb = mean(b);
  const va = variance(a, ma) / a.length;
  const vb = variance(b, mb) / b.length;
  const se = Math.sqrt(va + vb) * inflate;
  if (!Number.isFinite(se) || se === 0) return ma === mb ? 1 : 0;
  const t = (mb - ma) / se;
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  // two-sided: p = I_{df/(df+t²)}(df/2, 1/2)
  return regIncBeta(df / (df + t * t), df / 2, 0.5);
}

/** Regularized incomplete beta I_x(a, b) (continued fraction, Numerical Recipes). */
export function regIncBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = lgamma(a + b) - lgamma(a) - lgamma(b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b + lbeta);
  if (x < (a + 1) / (a + b + 2)) return (front * betacf(x, a, b)) / a;
  return 1 - (front * betacf(1 - x, b, a)) / b;
}

function betacf(x: number, a: number, b: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Lanczos log-gamma. */
function lgamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
