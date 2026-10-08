/**
 * The window a plan's quota is counted in. Every plan promises its analyses
 * and fix pull requests per MONTH ("2 full analyses a month"), but a yearly
 * subscription's billing period is a year — so for yearly plans the window is
 * the current monthly slice of that year, starting on the subscription's own
 * day of the month. Monthly plans use the billing period as-is.
 *
 * Mirrored in supabase/functions/start-analysis/index.ts (Deno can't import
 * from src/); keep the two in step.
 */

/** `start` shifted by `months` calendar months, clamped to the target month's last day (Jan 31 → Feb 28). */
function addMonthsClamped(start: Date, months: number): Date {
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(y, m, Math.min(start.getUTCDate(), lastDay), start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds()),
  );
}

export interface QuotaWindow {
  /** ISO start of the window (inclusive). */
  start: string;
  /** ISO end of the window (exclusive) — when the quota resets — or null when unknown. */
  end: string | null;
}

export function quotaWindow(
  periodStart: string,
  periodEnd: string | null,
  billingInterval: string | null | undefined,
  now: Date = new Date(),
): QuotaWindow {
  if (billingInterval !== "year") return { start: periodStart, end: periodEnd };
  const start = new Date(periodStart);
  let k = (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + (now.getUTCMonth() - start.getUTCMonth());
  k = Math.max(0, k);
  while (k > 0 && addMonthsClamped(start, k) > now) k--;
  const windowStart = addMonthsClamped(start, k);
  const next = addMonthsClamped(start, k + 1);
  const end = periodEnd && new Date(periodEnd) < next ? periodEnd : next.toISOString();
  return { start: windowStart.toISOString(), end };
}
