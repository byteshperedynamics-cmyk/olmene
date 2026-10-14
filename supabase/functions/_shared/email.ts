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
/**
 * Email shell (design: GLM's proposal, docs/email-templates/notify-layout.html):
 * paper background, white card, Georgia wordmark and heading, green button,
 * same look as the auth emails. tone "attention" adds an amber eyebrow
 * (regressions). paragraphs are trusted HTML: callers escape user content.
 */
export function layout(opts: { heading: string; paragraphs: string[]; cta?: { label: string; url: string }; footer: string; tone?: "default" | "attention" }): string {
  const p = opts.paragraphs.filter(Boolean).map((t) => `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:#55534E;">${t}</p>`).join("");
  const cta = opts.cta
    ? `<a href="${escapeHtml(opts.cta.url)}" style="display:inline-block;background:#2F6B45;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:10px;">${escapeHtml(opts.cta.label)}</a>`
    : "";
  const eyebrow = opts.tone === "attention"
    ? `<p style="margin:0 0 10px 0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#946F12;">Needs your attention</p>`
    : "";
  return `<!doctype html><html lang="en"><body style="margin:0;padding:0;background:#F6F5F1;font-family:Inter,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1C1D1B;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F5F1;padding:40px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border:1px solid #E4E2DC;border-radius:16px;">
<tr><td style="padding:32px 32px 8px 32px;"><p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;color:#2F6B45;">&#10047; olmene</p></td></tr>
<tr><td style="padding:16px 32px 0 32px;">${eyebrow}<h1 style="margin:0 0 12px 0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;font-weight:500;color:#1C1D1B;">${escapeHtml(opts.heading)}</h1>${p}${cta}</td></tr>
<tr><td style="padding:24px 32px 32px 32px;"><p style="margin:0;padding-top:16px;border-top:1px solid #E4E2DC;font-size:12px;line-height:1.6;color:#8A8882;">${opts.footer}</p></td></tr>
</table></td></tr></table></body></html>`;
}
