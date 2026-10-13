/** Shared shapes for the API channels (Webflow, WordPress). */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface AutoChange {
  /** Channel-specific field id ("seo.title", "media:123.alt_text", "meta.rank_math_description"). */
  field: string;
  label: string;
  /** Value it replaces (null = empty / inherited); revert writes it back. */
  before: string | null;
  after: string;
}

export interface AutoPlan {
  channel: "webflow" | "wordpress";
  /** Non-secret ids the change applies to (page, site, media ids). */
  target: Record<string, unknown>;
  changes: AutoChange[];
}

export interface AutoState extends AutoPlan {
  applied?: { at: string; ok: boolean; published?: boolean; error?: string };
  revertedAt?: string;
}

export class ChannelError extends Error {
  constructor(public channel: string, public status: number, message: string) {
    super(message);
  }
}

/** A short, safe error (no token echo, no HTML pages). */
export function channelError(channel: string, status: number, body: string): ChannelError {
  const reason = status === 401 || status === 403
    ? "the token or password was refused, or lacks permission"
    : status === 404
      ? "not found"
      : status === 429
        ? "rate limited, try again in a minute"
        : `HTTP ${status}`;
  let detail = "";
  try {
    const j = JSON.parse(body) as { message?: string; msg?: string; code?: string };
    detail = String(j.message ?? j.msg ?? j.code ?? "").replace(/\s+/g, " ").slice(0, 120);
  } catch {
    /* not JSON */
  }
  return new ChannelError(channel, status, detail ? `${reason}: ${detail}` : reason);
}
