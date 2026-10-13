/**
 * Alert channels (engine v2): the same events as the emails, posted to
 * Slack, Discord or any webhook the customer adds. Pure formatting + URL
 * rules here; delivery in index.ts (one attempt per event, failures counted
 * on the channel, a channel that fails 10 times in a row is paused).
 */

export type ChannelKind = "slack" | "discord" | "webhook";

export interface AlertChannel {
  id: string;
  user_id: string;
  kind: ChannelKind;
  url: string;
  secret: string | null;
  kinds: string[];
  failures: number;
}

/** Only real Slack / Discord webhook addresses; generic webhooks must be https on a public host. */
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

/** Does this channel want this kind of event? (empty list = everything) */
export function wants(channel: Pick<AlertChannel, "kinds">, kind: string): boolean {
  return !channel.kinds?.length || channel.kinds.includes(kind);
}

function firstUrl(text: string): string | null {
  return text.match(/https?:\/\/\S+/)?.[0]?.replace(/[).,]+$/, "") ?? null;
}

/** Slack incoming-webhook message: bold subject, the text, a link. */
export function slackBody(subject: string, text: string): Record<string, unknown> {
  const url = firstUrl(text);
  const plain = text.replace(/\n\n—[\s\S]*$/, "").trim();
  return {
    text: `*${subject}*\n${plain}`.slice(0, 3000),
    ...(url ? { blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*${subject}*\n${plain.replace(url, "").trim()}`.slice(0, 2900) } },
      { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open in Olmene" }, url }] },
    ] } : {}),
  };
}

/** Discord webhook message. */
export function discordBody(subject: string, text: string): Record<string, unknown> {
  const plain = text.replace(/\n\n—[\s\S]*$/, "").trim();
  return { username: "Olmene", content: `**${subject}**\n${plain}`.slice(0, 1900), allowed_mentions: { parse: [] } };
}

/** Generic webhook: the raw event. */
export function webhookBody(kind: string, payload: Record<string, unknown>, subject: string): Record<string, unknown> {
  return { event: kind, subject, payload, sentAt: new Date().toISOString(), source: "olmene" };
}

/** `sha256=<hex>` HMAC of the body with the channel's secret (header X-Olmene-Signature). */
export async function signBody(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `sha256=${[...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export const MAX_FAILURES = 10;
