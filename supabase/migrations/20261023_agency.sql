-- Agencies (2026-10-23): clients, branding and client portal links.
--
-- An agency workspace (workspaces.kind = 'agency') groups its sites by
-- client, puts its own name, logo and colour on everything its clients see,
-- and gives each client one page with every site's progress.
--
-- Like the workspaces migration, rows are keyed by the workspace owner's
-- user id; members read through readable_owner_ids() and change things
-- through the Worker. Additive and idempotent.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Clients
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.clients (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 80),
  website       text check (website is null or website ~ '^https?://[^\s]+$'),
  contact_email text check (contact_email is null or (contact_email = lower(btrim(contact_email)) and contact_email like '%_@_%.__%')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists clients_user_idx on public.clients (user_id);
alter table public.clients enable row level security;
drop policy if exists clients_workspace_read on public.clients;
create policy clients_workspace_read on public.clients
  for select to authenticated using (user_id in (select public.readable_owner_ids()));

-- Each site can belong to one client; removing the client keeps the site.
alter table public.sites add column if not exists client_id uuid references public.clients(id) on delete set null;
create index if not exists sites_client_idx on public.sites (client_id) where client_id is not null;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Branding: how pages the agency's clients see look
-- ─────────────────────────────────────────────────────────────────────────
alter table public.workspaces add column if not exists brand_name text;
alter table public.workspaces add column if not exists brand_color text;
alter table public.workspaces add column if not exists brand_url text;
alter table public.workspaces add column if not exists logo_path text;   -- <workspace id>/<random>.<ext> in brand-assets
alter table public.workspaces add column if not exists white_label boolean not null default false;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workspaces_brand_name_len') then
    alter table public.workspaces add constraint workspaces_brand_name_len
      check (brand_name is null or char_length(btrim(brand_name)) between 1 and 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workspaces_brand_color_hex') then
    alter table public.workspaces add constraint workspaces_brand_color_hex
      check (brand_color is null or brand_color ~ '^#[0-9a-f]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workspaces_brand_url_https') then
    alter table public.workspaces add constraint workspaces_brand_url_https
      check (brand_url is null or brand_url ~ '^https://[^\s]+$');
  end if;
end $$;

-- Logos are public to read (they head client pages). Only the Worker writes
-- them, after checking the image itself; no SVG (it can carry script).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-assets', 'brand-assets', true, 524288, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Client portal links: one public page per client, until it's turned off
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.client_portals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  client_id  uuid not null unique references public.clients(id) on delete cascade,
  slug       text not null unique check (slug ~ '^[a-z0-9]{12}$'),
  views      integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists client_portals_user_idx on public.client_portals (user_id);
alter table public.client_portals enable row level security;
drop policy if exists client_portals_workspace_read on public.client_portals;
create policy client_portals_workspace_read on public.client_portals
  for select to authenticated using (user_id in (select public.readable_owner_ids()));

-- Count a visit without a read-modify-write race. Service role only.
create or replace function public.bump_portal_views(p_slug text) returns void
language sql
security definer
set search_path = public
as $$
  update public.client_portals set views = views + 1 where slug = p_slug;
$$;
revoke all on function public.bump_portal_views(text) from public, anon, authenticated;
grant execute on function public.bump_portal_views(text) to service_role;
