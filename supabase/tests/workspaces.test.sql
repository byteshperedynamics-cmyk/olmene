-- Workspaces: who can read what, invitations, roles. Runs in one transaction
-- (scripts/test-sql.mjs); any exception fails the test.

-- People: Ana owns a workspace; Ben is a member; Cleo is a viewer; Dan is a
-- stranger with an account of his own.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@acme.example'),
  ('00000000-0000-0000-0000-0000000000b2', 'ben@acme.example'),
  ('00000000-0000-0000-0000-0000000000c3', 'cleo@client.example'),
  ('00000000-0000-0000-0000-0000000000d4', 'dan@elsewhere.example');

insert into public.sites (id, user_id, url, host) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'https://acme.example/', 'acme.example'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d4', 'https://dan.example/', 'dan.example');
insert into public.analysis_jobs (id, user_id, site_url, input) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'https://acme.example/', '{}'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000d4', 'https://dan.example/', '{}');
insert into public.agent_jobs (id, user_id) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1');
insert into public.planned_actions (agent_job_id, fixer_id) values
  ('30000000-0000-0000-0000-000000000001', 'meta-description');

-- Ana's workspace, created on first use, with Ana as its owner
do $$
declare ws uuid; again uuid;
begin
  ws := public.ensure_workspace('00000000-0000-0000-0000-0000000000a1', '  Acme  ');
  again := public.ensure_workspace('00000000-0000-0000-0000-0000000000a1', 'Other name');
  if ws is distinct from again then raise exception 'ensure_workspace must return the same workspace'; end if;
  if (select name from public.workspaces where id = ws) <> 'Acme' then raise exception 'workspace name should be trimmed'; end if;
  if (select role from public.workspace_members where workspace_id = ws and user_id = '00000000-0000-0000-0000-0000000000a1') <> 'owner' then
    raise exception 'owner row missing';
  end if;
end $$;

-- Invitations: the link token's hash is stored, never the token
insert into public.workspace_invites (workspace_id, email, role, token_hash, invited_by)
select w.id, x.email, x.role, encode(digest(x.token, 'sha256'), 'hex'), w.owner_id
  from public.workspaces w,
       (values ('ben@acme.example', 'member', 'token-ben'),
               ('cleo@client.example', 'viewer', 'token-cleo'),
               ('late@acme.example', 'member', 'token-late')) as x(email, role, token)
 where w.owner_id = '00000000-0000-0000-0000-0000000000a1';
update public.workspace_invites set expires_at = now() - interval '1 day' where email = 'late@acme.example';

do $$
declare ws uuid;
begin
  -- the right person accepts (email compared case-insensitively)
  ws := public.accept_workspace_invite(encode(digest('token-ben', 'sha256'), 'hex'), '00000000-0000-0000-0000-0000000000b2', ' Ben@Acme.example ');
  if ws is null then raise exception 'accept returned no workspace'; end if;
  perform public.accept_workspace_invite(encode(digest('token-cleo', 'sha256'), 'hex'), '00000000-0000-0000-0000-0000000000c3', 'cleo@client.example');

  -- a used link can't be used again, even by the same person
  begin
    perform public.accept_workspace_invite(encode(digest('token-ben', 'sha256'), 'hex'), '00000000-0000-0000-0000-0000000000b2', 'ben@acme.example');
    raise exception 'reused invite was accepted';
  exception when others then
    if sqlerrm <> 'invite_used' then raise; end if;
  end;
  -- an expired link
  begin
    perform public.accept_workspace_invite(encode(digest('token-late', 'sha256'), 'hex'), '00000000-0000-0000-0000-0000000000d4', 'late@acme.example');
    raise exception 'expired invite was accepted';
  exception when others then
    if sqlerrm <> 'invite_expired' then raise; end if;
  end;
  -- a forwarded link, opened by someone else
  update public.workspace_invites set expires_at = now() + interval '1 day' where email = 'late@acme.example';
  begin
    perform public.accept_workspace_invite(encode(digest('token-late', 'sha256'), 'hex'), '00000000-0000-0000-0000-0000000000d4', 'dan@elsewhere.example');
    raise exception 'invite accepted by the wrong email';
  exception when others then
    if sqlerrm <> 'invite_email' then raise; end if;
  end;
  -- a made-up link
  begin
    perform public.accept_workspace_invite(repeat('0', 64), '00000000-0000-0000-0000-0000000000d4', 'dan@elsewhere.example');
    raise exception 'unknown invite was accepted';
  exception when others then
    if sqlerrm <> 'invite_not_found' then raise; end if;
  end;

  if public.workspace_role('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1') <> 'owner' then raise exception 'role: owner'; end if;
  if public.workspace_role('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2') <> 'member' then raise exception 'role: member'; end if;
  if public.workspace_role('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c3') <> 'viewer' then raise exception 'role: viewer'; end if;
  if public.workspace_role('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d4') is not null then raise exception 'role: stranger'; end if;
  if public.workspace_role('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000d4') <> 'owner' then raise exception 'role: own account'; end if;
end $$;

-- ── Reading as Ben (member) ──────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.sites) <> 1 then raise exception 'Ben should see exactly Acme''s site'; end if;
  if exists (select 1 from public.sites where host = 'dan.example') then raise exception 'Ben sees a stranger''s site'; end if;
  if (select count(*) from public.analysis_jobs) <> 1 then raise exception 'Ben should see Acme''s analysis'; end if;
  if (select count(*) from public.planned_actions) <> 1 then raise exception 'Ben should see the fix plan'; end if;
  if (select count(*) from public.workspaces) <> 1 then raise exception 'Ben should see one workspace'; end if;
  if (select count(*) from public.workspace_members) <> 3 then raise exception 'Ben should see the 3 members of his workspace'; end if;
  if (select count(*) from public.workspace_invites) <> 0 then raise exception 'invites must not be readable'; end if;
end $$;

-- members can't change anything directly; everything goes through the Worker
do $$
begin
  begin
    insert into public.workspace_members (workspace_id, user_id, role)
    select id, '00000000-0000-0000-0000-0000000000b2', 'admin' from public.workspaces limit 1;
    raise exception 'a member could insert a membership';
  exception when insufficient_privilege then null;
  end;
  update public.workspace_members set role = 'owner' where user_id = '00000000-0000-0000-0000-0000000000b2';
  if found then raise exception 'a member could change their own role'; end if;
  delete from public.sites;
  if found then raise exception 'a member could delete sites directly'; end if;
  begin
    perform public.workspace_role('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b2');
    raise exception 'workspace_role must be Worker-only';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ensure_workspace('00000000-0000-0000-0000-0000000000b2', 'Mine');
    raise exception 'ensure_workspace must be Worker-only';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.accept_workspace_invite(repeat('0', 64), '00000000-0000-0000-0000-0000000000b2', 'ben@acme.example');
    raise exception 'accept_workspace_invite must be Worker-only';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ── Reading as Dan (stranger) ────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.sites) <> 1 or not exists (select 1 from public.sites where host = 'dan.example') then
    raise exception 'Dan should see only his own site';
  end if;
  if (select count(*) from public.workspaces) <> 0 then raise exception 'Dan sees a workspace he isn''t in'; end if;
  if (select count(*) from public.workspace_members) <> 0 then raise exception 'Dan sees members of another workspace'; end if;
  if (select count(*) from public.planned_actions) <> 0 then raise exception 'Dan sees another account''s fix plan'; end if;
end $$;
reset role;

-- ── Signed out ───────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
begin
  if (select count(*) from public.sites) <> 0 then raise exception 'anon sees sites'; end if;
  if (select count(*) from public.workspaces) <> 0 then raise exception 'anon sees workspaces'; end if;
end $$;
reset role;

-- Leaving: when Ben's membership goes, so does his access
delete from public.workspace_members where user_id = '00000000-0000-0000-0000-0000000000b2';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.sites) <> 0 then raise exception 'Ben still sees Acme after leaving'; end if;
end $$;
reset role;

-- Deleting the owner's account removes the workspace and every membership
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';
do $$
begin
  if exists (select 1 from public.workspaces) then raise exception 'workspace outlived its owner'; end if;
  if exists (select 1 from public.workspace_members) then raise exception 'memberships outlived the workspace'; end if;
end $$;
