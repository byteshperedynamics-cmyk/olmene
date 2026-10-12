/**
 * Transactional email through Brevo's HTTP API (the same provider that sends
 * Olmene's sign-in mail over SMTP). Needs BREVO_API_KEY and NOTIFY_FROM_EMAIL
 * (a sender verified in Brevo); without them nothing is sent.
 */

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
  tag: string;
  /** One-click unsubscribe (RFC 8058) for optional mail such as digests. */
  unsubscribeUrl?: string;
}

export function emailConfigured(): boolean {
  return !!(Deno.env.get("BREVO_API_KEY") && Deno.env.get("NOTIFY_FROM_EMAIL"));
}

export async function sendEmail(mail: Email): Promise<{ ok: boolean; error?: string }> {
  const key = Deno.env.get("BREVO_API_KEY");
  const from = Deno.env.get("NOTIFY_FROM_EMAIL");
  if (!key || !from) return { ok: false, error: "email not configured" };
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: { name: Deno.env.get("NOTIFY_FROM_NAME") ?? "Olmene", email: from },
        to: [{ email: mail.to }],
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
        tags: [mail.tag],
        ...(mail.unsubscribeUrl
          ? { headers: { "List-Unsubscribe": `<${mail.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
          : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { ok: false, error: `brevo ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 160) };
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Plain, readable layout. Visual design belongs to the UI lane
 * (docs/email-templates/); this keeps every message legible in any client.
 */
export function layout(opts: { heading: string; paragraphs: string[]; cta?: { label: string; url: string }; footer: string }): string {
  const p = opts.paragraphs.map((t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2328;">${t}</p>`).join("");
  const cta = opts.cta
    ? `<p style="margin:22px 0;"><a href="${escapeHtml(opts.cta.url)}" style="display:inline-block;padding:11px 18px;border-radius:6px;background:#1f2328;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">${escapeHtml(opts.cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;">
<p style="margin:0 0 18px;font-size:16px;font-weight:600;color:#1f2328;">olmene</p>
<h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#1f2328;">${escapeHtml(opts.heading)}</h1>
${p}${cta}
<p style="margin:28px 0 0;font-size:12px;line-height:1.5;color:#59636e;">${opts.footer}</p>
</div></body></html>`;
}
