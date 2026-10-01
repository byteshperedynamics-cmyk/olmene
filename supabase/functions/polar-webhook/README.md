# polar-webhook

Receives Polar events (order.*, subscription.*) and writes `subscriptions` /
`report_credits`. Source pulled from the deployed function on 2026-10-02 and
fixed to verify Standard Webhooks signatures (`id.timestamp.body`).

Deploy (Polar sends no Supabase JWT, so JWT verification must stay off):

    npx supabase functions deploy polar-webhook --project-ref ffoevhldpppyfsfgufmx --no-verify-jwt

Secrets it reads: POLAR_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
