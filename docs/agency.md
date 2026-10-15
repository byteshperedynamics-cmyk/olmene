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
| Member | Add and edit clients, give sites to clients, create and turn off client pages. |
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

Members read all of it through `readable_owner_ids()`; every change goes
through the Worker. Data export includes clients and client pages.

## API

| Route | Who |
|---|---|
| `GET /api/clients/` | viewer+: branding, clients with sites and page links, unassigned sites, your role |
| `POST /api/clients/` `{ name, website?, contactEmail? }` | member+ |
| `PATCH /api/clients/[id]` `{ name?, website?, contactEmail? }` | member+ |
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

## Tests

```bash
npm run test:sql        # supabase/tests/agency.test.sql: who reads what, rules, views, removal
bun test src/lib/agency # input rules, slugs, logo sniffing, white label
```
