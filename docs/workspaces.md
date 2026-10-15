# Workspaces (teams)

Companies and agencies work in Olmene as a team. A **workspace is an account
that pays**: the owner's plan, sites, reports, fixes and connections. People
join by invitation and share all of it according to their role.

| Role | Can |
|---|---|
| Owner | Plan and billing, and everything below. Exactly one (`workspaces.owner_id`). |
| Admin | Manage the team (invite, change roles, remove), connect GitHub/WordPress/Webflow/Search Console, alert channels, PR checks, and every kind of work. |
| Member | Run scans and reports, start, approve, reject and cancel fix runs, guided fixes, share progress links, AI visibility questions. |
| Viewer | Read everything; change nothing. |

Seats per plan (owner included) live in `src/lib/workspace/roles.ts`
(`SEATS_BY_PLAN`): no plan or a one-off report = 1, Fix = 2, Team = 5.

## How it works

- **Data stays keyed by the owner's user id** (every existing `user_id`
  column), so the engine, quotas and billing are unchanged. Members read
  through extra row-level policies (`readable_owner_ids()`), never on
  `connections`, `revocations` or secrets.
- **Worker routes** call `requireActor(req, minimumRole)`
  (`src/lib/workspace/server.ts`): the person signed in, the owner whose data
  they act on (from the `x-olmene-workspace` header; their own account when
  absent) and their role. Data uses `actor.ownerId`; "who did it"
  (approvals, audit entries, `created_by`) uses `actor.user.id`.
- **Edge functions** take `workspace` in the request body
  (`start-analysis`) and check it with `supabase/functions/_shared/workspace.ts`.
- **The browser** remembers the active workspace per browser
  (`src/lib/workspace/client.ts`), sends the header with every call, and
  narrows its direct reads to that owner. Switching reloads the page; other
  tabs follow.
- **Invitations**: only the SHA-256 of the link token is stored; a link
  works for 14 days, once, and only for the invited address
  (`accept_workspace_invite`). The `notify` function emails it, never posts it
  to alert channels, and clears the link from the row once sent.
- Deleting an account is refused while other people are in its workspace.

## API

| Route | Who |
|---|---|
| `GET /api/workspaces/` | signed in: your account + workspaces you're in |
| `GET /api/workspace/` | viewer+: members, invitations (admins), seats |
| `PATCH /api/workspace/` `{ name?, kind? }` | admin+ |
| `POST /api/workspace/invites/` `{ email, role }` | admin+ (re-inviting sends a fresh link) |
| `DELETE /api/workspace/invites/[id]` | admin+ |
| `PATCH /api/workspace/members/[userId]` `{ role }` | admin+ (never the owner) |
| `DELETE /api/workspace/members/[userId]` | admin+, or yourself to leave |
| `GET /api/invites/?t=` | anyone with the link (what it's for) |
| `POST /api/invites/` `{ token }` | the invited person, signed in |

Screens: `/app/team/`, `/invite/?t=…`, the switcher in the app header.
Dev gallery: `/dev/team/?role=owner|admin|member|viewer&full=1`.

## Tests

```bash
npm run test:sql      # every migration on a real Postgres + supabase/tests/*.test.sql
bun test src/lib/workspace
```

`test:sql` needs a local Postgres (`PGHOST`/`PGPORT`/`PGUSER`); CI starts the
runner image's own. The workspace tests check the rules as the owner, a
member, a viewer, a stranger and signed out.
