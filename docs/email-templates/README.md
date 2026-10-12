# Olmene auth email templates

Supabase still sends sign-in emails with the old MarketWise branding. Paste
these into Supabase Dashboard → Authentication → Emails → Templates:

| Template | Subject | File |
|---|---|---|
| Magic Link | Your Olmene sign-in link | magic-link.html |
| Confirm signup | Confirm your Olmene account | confirm-signup.html |
| Change Email Address | Confirm your new Olmene email | change-email.html |
| Reset Password | Reset your Olmene password | reset-password.html |

Also set Authentication → Emails → SMTP Settings → Sender name to `Olmene`
(and the sender email to an olmene.com address if Brevo has it verified).

## Notification templates (engine `notify` function) — proposal, 2026-10-13

The seven notification kinds (`report_ready`, `pr_opened`, `fixes_live`,
`fix_regression`, `site_regression`, `competitor_change`, `weekly_digest`)
currently render through the plain `layout()` in
`supabase/functions/_shared/email.ts`. The UI lane proposes moving them onto
the same visual language as these auth emails (paper `#F6F5F1`, white card
with hairline `#E4E2DC`, Georgia wordmark and headings, green `#2F6B45`
wordmark/links/button):

- `notify-layout.html` — the annotated replacement shell for `layout()`.
  Same signature `{ heading, paragraphs, cta?, footer }` plus one optional
  field, `tone?: "default" | "attention"`. `paragraphs` stay trusted HTML
  (callers keep escaping user content with `escapeHtml`, as today).
- `notify-kinds.html` — all seven kinds rendered with the sample payloads
  from `supabase/functions/notify/templates.test.ts`, for visual review.

Wiring notes for the engine lane:

1. Replace the body of `layout()` with the shell above; default `tone` keeps
   every existing call site valid.
2. Pass `tone: "attention"` from `fix_regression` and `site_regression` — it
   adds one amber ("Needs your attention", `#946F12`) eyebrow above the
   heading. No other structural change.
3. Subjects, body copy and link targets stay exactly as `templates.ts` has
   them (the tests only assert subject length, footer presence, escaping and
   the `optional` flags — all unchanged).
4. Email palette intentionally keeps `#2F6B45` (not the site's newer
   `#256039` deep elm) so the auth and notification mail match; if the green
   is ever bumped, move both sets in the same pass.

