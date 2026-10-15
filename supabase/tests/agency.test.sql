-- Agencies: clients, sites grouped by client, branding rules, portal links.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@studio.example'),
  ('00000000-0000-0000-0000-0000000000b2', 'ben@studio.example'),
  ('00000000-0000-0000-0000-0000000000d4', 'dan@elsewhere.example');

do $$
declare ws uuid;
begin
  ws := public.ensure_workspace('00000000-0000-0000-0000-0000000000a1', 'Studio');
  update public.workspaces set kind = 'agency' where id = ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, '00000000-0000-0000-0000-0000000000b2', 'member');
end $$;

insert into public.clients (id, user_id, name, website, contact_email) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Bakery Co', 'https://bakery.example', 'owner@bakery.example'),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d4', 'Dan''s client', null, null);
insert into public.sites (id, user_id, url, host, client_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'https://bakery.example/', 'bakery.example', '40000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'https://shop.bakery.example/', 'shop.bakery.example', '40000000-0000-0000-0000-000000000001');
insert into public.client_portals (user_id, client_id, slug) values
  ('00000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-000000000001', 'abcdefghjk23');

-- Branding rules hold
do $$
begin
  begin
    update public.workspaces set brand_color = 'red' where owner_id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'brand colour must be #rrggbb';
  exception when check_violation then null;
  end;
  begin
    update public.workspaces set brand_url = 'javascript:alert(1)' where owner_id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'brand url must be https';
  exception when check_violation then null;
  end;
  update public.workspaces set brand_name = 'Northwind Studio', brand_color = '#1f6feb', brand_url = 'https://northwind.example'
   where owner_id = '00000000-0000-0000-0000-0000000000a1';
  begin
    insert into public.clients (user_id, name, website) values ('00000000-0000-0000-0000-0000000000a1', 'X', 'ftp://nope');
    raise exception 'client website must be http(s)';
  exception when check_violation then null;
  end;
  begin
    insert into public.client_portals (user_id, client_id, slug) values ('00000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-000000000001', 'zzzzzzzzzzzz');
    raise exception 'one portal per client';
  exception when unique_violation then null;
  end;
  begin
    insert into public.client_portals (user_id, client_id, slug) values ('00000000-0000-0000-0000-0000000000d4', '40000000-0000-0000-0000-000000000002', 'SHORT');
    raise exception 'portal slug must be 12 lowercase characters';
  exception when check_violation then null;
  end;
end $$;

-- Ben (member) reads the agency's clients and portal; not Dan's
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.clients) <> 1 then raise exception 'Ben should see the studio''s one client'; end if;
  if (select count(*) from public.client_portals) <> 1 then raise exception 'Ben should see the portal link'; end if;
  if (select count(*) from public.sites where client_id = '40000000-0000-0000-0000-000000000001') <> 2 then raise exception 'Ben should see both client sites'; end if;
  if (select brand_name from public.workspaces limit 1) <> 'Northwind Studio' then raise exception 'Ben should see the branding'; end if;
  update public.clients set name = 'Hacked';
  if found then raise exception 'members change clients through the Worker only'; end if;
  begin
    perform public.bump_portal_views('abcdefghjk23');
    raise exception 'bump_portal_views must be Worker-only';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Dan sees only his own client
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.clients) <> 1 or not exists (select 1 from public.clients where name = 'Dan''s client') then
    raise exception 'Dan should see only his own client';
  end if;
  if (select count(*) from public.client_portals) <> 0 then raise exception 'Dan sees another agency''s portal'; end if;
end $$;
reset role;

-- Views count up (as the Worker), and removing a client keeps its sites
do $$
begin
  perform public.bump_portal_views('abcdefghjk23');
  perform public.bump_portal_views('abcdefghjk23');
  if (select views from public.client_portals where slug = 'abcdefghjk23') <> 2 then raise exception 'views not counted'; end if;
  delete from public.clients where id = '40000000-0000-0000-0000-000000000001';
  if (select count(*) from public.sites where host like '%bakery.example') <> 2 then raise exception 'sites went with the client'; end if;
  if exists (select 1 from public.sites where client_id is not null) then raise exception 'sites still point at a removed client'; end if;
  if exists (select 1 from public.client_portals) then raise exception 'the portal outlived its client'; end if;
end $$;
