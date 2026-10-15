# Agencies

An agency is a workspace (see [workspaces.md](workspaces.md)) whose
`kind` is `agency`. It adds a **Clients** page: sites grouped by client, a
page per client to send them, and the agency's own branding on everything
clients see. A workspace becomes an agency from the Team page ("What it's
for"), from the Clients page, or by saving branding. Switching back hides the
Clients page; nothing is deleted.

| Who | Can |
|---|---|
| Viewer | See clients, their sites, page links and branding; copy a link. |
| Member | Add and edit clients, give sites to clients, create and turn off client pages, set up emailed reports and send a test. |
| Admin, owner | Also remove clients and change branding (name, logo, colour, website, white label). |

## What clients see

- **Client page** `/c/<slug>/`: the agency's bar (logo or name, accent
  colour, "Visit {agency}"), "Prepared by {agency}", a progress card per site
  (score, weekly line, checks, milestones; up to 12 sites) and a line saying
  reports and findings stay private. One link per client; the slug is 12
  characters from an alphabet without look-alikes (about 60 bits). Turning a
  page off stops the link at once; a new one gets a new address. Never
  indexed, no referrer, link previews name the client and the agency.
- **Progress links** `/p/<slug>/` shared from an agency workspace carry the
  same branding instead of Olmene's header, and no "check your own site"
  pitch.
- "Measured with Olmene" sits at the foot of both unless the plan includes
  white label (`canWhiteLabel`: Team, or a future Agency plan). The setting
  is only honoured while the plan includes it, so a downgrade brings the
  credit back.
- Neither page shows Olmene's cookie banner or loads analytics
  (`data-agency-page`, `src/lib/consent.ts`): those visitors are the
  agency's clients.

## Emailed client reports

Each client can get a short email, **weekly** (Mondays) or **monthly** (the
1st), at 08:00 UTC: every site's score, the change over the period, checks
passing and checks fixed, and a "See the full page" button when the client
page is on. It goes to people the agency adds on the client's card (up to 10
per client, 250 per workspace).

- **Under the agency's name**: the From name is "{agency} via Olmene" (just
  "{agency}" with white label); the address stays `NOTIFY_FROM_EMAIL`, so
  the domain is still Olmene's. Replies go to the workspace owner. The
  header shows the agency's logo (PNG/JPEG; WebP falls back to the name,
  since many mail apps can't show it) over its accent colour; the button
  uses that colour with readable text (`textOn`).
- **Schedule**: choosing a cadence sets `clients.report_next_at` to the
  next slot, so there's time to add everyone before the first one. The
  `monitor` function (every 10 minutes) queues due clients: only paying
  agencies, only when a site of the client's was scanned during the period,
  only to people still subscribed. One `notifications` row per recipient
  (`client_report`, dedupe `client_report:<recipient>:<day>`), then the slot
  moves on from *now*, so an outage never sends a burst.
- **Sending**: `notify` builds the report when it sends (so a test and the
  real one are the same email), never posts it to Slack/Discord/webhooks,
  and skips anyone removed or unsubscribed since it was queued.
- **Unsubscribe**: the footer link opens `/unsubscribe/?t=<token>` on
  olmene.com (the agency's branding, no banner or analytics), which asks
  first and stops the emails with a button (`POST /api/report-unsubscribe/`).
  A link alone never unsubscribes anyone: mail scanners (Outlook Safe Links
  and the like) open every link in an email. The mail app's own button
  (`List-Unsubscribe`, RFC 8058) POSTs to `notify?unsubscribe_client=<token>`;
  a GET there redirects to the page. The person stays listed as
  unsubscribed so the agency can't add them back.
  Tokens are 64 hex characters, readable by the service role only (column
  grants), and left out of the data export.
- **Send me a test**: emails the signed-in person ("[Test]", no unsubscribe
  link), at most once a minute per client.

Code: `src/components/agency/client-reports.tsx` (the card section),
`src/lib/agency/server.ts` (recipients, cadence, test),
`supabase/functions/_shared/client-report.ts` (schedule and per-site
summary, mirrored in `src/lib/agency/rules.ts`),
`supabase/functions/notify/client-report.ts` (reads a report) and
`notify/templates.ts` (`client_report`).

## Data

Migration `20261023_agency.sql`, keyed by the workspace owner's user id like
everything else:

- `clients` (name, website, contact email) and `sites.client_id` (removing a
  client keeps its sites, unassigned).
- `workspaces.brand_name`, `brand_color` (`#rrggbb`), `brand_url` (https),
  `logo_path`, `white_label`.
- `client_portals` (one per client, `slug`, `views`) and
  `bump_portal_views()` (Worker only).
- Logos live in the public `brand-assets` bucket at `<workspace id>/…`: PNG,
  JPEG or WebP up to 512 KB, checked by their first bytes on the Worker. No
  SVG (it can carry script). Account deletion removes them.

Migration `20261024_client_reports.sql` adds `clients.report_cadence`
(`off` / `weekly` / `monthly`), `report_next_at`, `report_sent_at`, and
`client_recipients` (address, `unsub_token`, `unsubscribed_at`, who added
them; one row per address per client).

Members read all of it through `readable_owner_ids()` (except recipients'
unsubscribe tokens); every change goes through the Worker. Data export
includes clients, client pages and report recipients.

## API

| Route | Who |
|---|---|
| `GET /api/clients/` | viewer+: branding, clients with sites and page links, unassigned sites, your role |
| `POST /api/clients/` `{ name, website?, contactEmail? }` | member+ |
| `PATCH /api/clients/[id]` `{ name?, website?, contactEmail?, reportCadence? }` | member+ |
| `POST /api/clients/[id]/recipients` `{ email }` | member+: add someone to the report (409 if they unsubscribed) |
| `DELETE /api/clients/[id]/recipients/[recipientId]` | member+ (not those who unsubscribed) |
| `POST /api/clients/[id]/report-test` | member+: email yourself the report (202; 429 within a minute) |
| `DELETE /api/clients/[id]` | admin+ |
| `POST` / `DELETE /api/clients/[id]/portal` | member+: turn the client page on / off |
| `PUT /api/sites/[id]/client` `{ clientId \| null }` | member+ |
| `PATCH /api/workspace/brand/` `{ name?, color?, url?, whiteLabel? }` | admin+ (white label needs the plan: 402) |
| `POST` / `DELETE /api/workspace/brand/logo/` (raw image body) | admin+ |

Every change returns the Clients page's new state. Input rules (and their
messages) are in `src/lib/agency/rules.ts`, shared by the Worker and the
browser.

Screens: `/app/clients/`, the "What it's for" choice on `/app/team/`,
`/c/<slug>/`. Dev gallery (no backend needed; the Clients page runs against
an in-memory copy of the API):

- `/dev/clients/?role=owner|admin|member|viewer&state=company|new|empty&brand=none|wl&plan=fix`
- `/dev/portal/?state=wl|plain|name|empty|gone`
- `/dev/share/?state=agency|agency-wl`
- `/unsubscribe/?t=<anything>` shows the "link isn't valid" state locally

## Tests

```bash
npm run test:sql        # agency.test.sql, client_reports.test.sql: who reads what, rules, views, removal
bun test src/lib/agency # input rules, slugs, logo sniffing, white label, report schedule
deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/client-report.test.ts supabase/functions/notify
```
