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
