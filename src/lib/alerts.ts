/**
 * Alert channels (engine v2), Worker side: validation and masking for the
 * Slack / Discord / webhook destinations customers add. Delivery happens in
 * the notify edge function (supabase/functions/notify/channels.ts keeps the
 * same URL rules).
 */

export type ChannelKind = "slack" | "discord" | "webhook";

export const ALERT_KINDS = [
  "report_ready", "pr_opened", "fixes_live", "fix_regression", "site_regression",
  "competitor_change", "weekly_digest", "guided_live", "ai_visibility_change",
] as const;

export function allowedHookUrl(kind: ChannelKind, raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  const host = u.hostname.toLowerCase();
  if (kind === "slack") return host === "hooks.slack.com" && /^\/services\/[A-Za-z0-9/_-]+$/.test(u.pathname);
  if (kind === "discord") return (host === "discord.com" || host === "discordapp.com") && /^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(u.pathname);
  if (!host.includes(".") || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return false;
  return !/(^|\.)(localhost|local|internal|lan|corp|home\.arpa|test|invalid|onion)$/.test(host);
}

/** Show enough to recognise a destination, never the secret path. */
export function maskHookUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const tail = u.pathname.slice(-4);
    return `${u.hostname}/…${tail}`;
  } catch {
    return "…";
  }
}
