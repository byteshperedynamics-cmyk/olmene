-- Client reports: cadence, recipients, who reads what, and what a removed client takes with it.

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@studio.example'),
  ('00000000-0000-0000-0000-0000000000b2', 'ben@studio.example'),
  ('00000000-0000-0000-0000-0000000000d4', 'dan@elsewhere.example');

do $$
declare ws uuid;
begin
  ws := public.ensure_workspace('00000000-0000-0000-0000-0000000000a1', 'Studio');
  update public.workspaces set kind = 'agency' where id = ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, '00000000-0000-0000-0000-0000000000b2', 'viewer');
end $$;

insert into public.clients (id, user_id, name) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Bakery Co'),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d4', 'Dan''s client');
insert into public.client_recipients (id, user_id, client_id, email) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-000000000001', 'owner@bakery.example'),
  ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d4', '40000000-0000-0000-0000-000000000002', 'boss@dan.example');

-- Rules hold
do $$
declare t text;
begin
  if (select report_cadence from public.clients where id = '40000000-0000-0000-0000-000000000001') <> 'off' then
    raise exception 'reports start off';
  end if;
  begin
    update public.clients set report_cadence = 'daily' where id = '40000000-0000-0000-0000-000000000001';
    raise exception 'cadence is off, weekly or monthly';
  exception when check_violation then null;
  end;
  update public.clients set report_cadence = 'weekly', report_next_at = now() where id = '40000000-0000-0000-0000-000000000001';

  select unsub_token into t from public.client_recipients where id = '50000000-0000-0000-0000-000000000001';
  if t !~ '^[0-9a-f]{64}$' then raise exception 'unsubscribe token should be 64 hex characters, got %', t; end if;
  if t = (select unsub_token from public.client_recipients where id = '50000000-0000-0000-0000-000000000002') then
    raise exception 'tokens must differ';
  end if;
  begin
    insert into public.client_recipients (user_id, client_id, email) values ('00000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-000000000001', 'owner@bakery.example');
    raise exception 'one row per address per client';
  exception when unique_violation then null;
  end;
  begin
    insert into public.client_recipients (user_id, client_id, email) values ('00000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-000000000001', 'Owner@Bakery.example');
    raise exception 'addresses are stored lower-case';
  exception when check_violation then null;
  end;
  begin
    insert into public.client_recipients (user_id, client_id, email) values ('00000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-000000000001', 'not-an-email');
    raise exception 'addresses must look like one';
  exception when check_violation then null;
  end;
end $$;

-- Ben (viewer) reads the studio's recipients but not their unsubscribe tokens, and changes nothing
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.client_recipients) <> 1 then raise exception 'Ben should see the studio''s one recipient'; end if;
  if (select email from public.client_recipients limit 1) <> 'owner@bakery.example' then raise exception 'Ben should see the address'; end if;
  begin
    perform unsub_token from public.client_recipients;
    raise exception 'unsubscribe tokens must stay server-side';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.client_recipients set unsubscribed_at = now();
    raise exception 'recipients change through the Worker only';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.client_recipients (user_id, client_id, email) values ('00000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-000000000001', 'x@y.example');
    raise exception 'recipients are added through the Worker only';
  exception when insufficient_privilege then null;
  end;
  update public.clients set report_cadence = 'off';
  if found then raise exception 'cadence changes through the Worker only'; end if;
end $$;
reset role;

-- Dan sees only his own recipient
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.client_recipients) <> 1 or not exists (select 1 from public.client_recipients where email = 'boss@dan.example') then
    raise exception 'Dan should see only his own recipient';
  end if;
end $$;
reset role;

-- Anonymous visitors read nothing
set local role anon;
do $$
begin
  perform 1 from public.client_recipients;
  raise exception 'anon must not read recipients';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Removing a client removes who got its reports
do $$
begin
  delete from public.clients where id = '40000000-0000-0000-0000-000000000001';
  if exists (select 1 from public.client_recipients where client_id = '40000000-0000-0000-0000-000000000001') then
    raise exception 'recipients outlived their client';
  end if;
end $$;
