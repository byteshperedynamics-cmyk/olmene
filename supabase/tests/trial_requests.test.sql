-- Trial requests: rules hold, and no browser can read or write them.

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'ana@studio.example');

insert into public.trial_requests (name, email, company, website, kind, team_size, note, language) values
  ('Ana Lima', 'ana@studio.example', 'Northwind Studio', 'https://northwind.example/', 'agency', '6-20', 'Twelve clients on WordPress.', 'en');

do $$
begin
  if (select status from public.trial_requests limit 1) <> 'new' then raise exception 'requests start as new'; end if;
  begin
    insert into public.trial_requests (name, email, company, website, kind) values ('X', 'Not@Lower.example', 'X', 'https://x.example/', 'company');
    raise exception 'emails are stored lower-case';
  exception when check_violation then null;
  end;
  begin
    insert into public.trial_requests (name, email, company, website, kind) values ('X', 'x@x.example', 'X', 'javascript:alert(1)', 'company');
    raise exception 'websites are http(s)';
  exception when check_violation then null;
  end;
  begin
    insert into public.trial_requests (name, email, company, website, kind) values ('X', 'x@x.example', 'X', 'https://x.example/', 'reseller');
    raise exception 'kind is company or agency';
  exception when check_violation then null;
  end;
  begin
    insert into public.trial_requests (name, email, company, website, kind, team_size) values ('X', 'x@x.example', 'X', 'https://x.example/', 'company', '1000');
    raise exception 'team size is one of the listed ranges';
  exception when check_violation then null;
  end;
  begin
    insert into public.trial_requests (name, email, company, website, kind) values ('  ', 'x@x.example', 'X', 'https://x.example/', 'company');
    raise exception 'a name is required';
  exception when check_violation then null;
  end;
end $$;

-- Signed in or not, browsers can't read or add requests
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform 1 from public.trial_requests;
    raise exception 'authenticated must not read trial requests';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.trial_requests (name, email, company, website, kind) values ('X', 'x@x.example', 'X', 'https://x.example/', 'company');
    raise exception 'authenticated must not insert trial requests';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role anon;
do $$
begin
  perform 1 from public.trial_requests;
  raise exception 'anon must not read trial requests';
exception when insufficient_privilege then null;
end $$;
reset role;
