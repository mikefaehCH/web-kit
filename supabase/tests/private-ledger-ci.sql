\set ON_ERROR_STOP on
-- Runs exclusively in the empty CI database with synthetic users.
insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
set role authenticated;
insert into public.web_kit_private_trips(id,title,people) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Fixture',array['A','B']);
insert into public.web_kit_private_entries(trip_id,entry_id,payload) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','e','{"id":"e"}');
do $$ declare changed integer; begin
  update public.web_kit_private_trips set title='Updated', people=array['A','B','C'], version=999 where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and version=1;
  get diagnostics changed = row_count;
  assert changed = 1 and (select version from public.web_kit_private_trips where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc') = 2, 'trip revision';
  update public.web_kit_private_trips set title='Stale' where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and version=1;
  get diagnostics changed = row_count;
  assert changed = 0, 'stale trip update';
  begin
    update public.web_kit_private_trips set people=array['A'] where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception 'participant removal allowed';
  exception when raise_exception then
    if sqlerrm = 'participant removal allowed' then raise; end if;
  end;
end $$;

do $$ declare changed integer; v integer; begin
  update public.web_kit_private_entries set payload='{"id":"e","value":"first"}', version=999 where entry_id='e' and version=1;
  get diagnostics changed = row_count;
  assert changed = 1, 'first update';
  select version into v from public.web_kit_private_entries where entry_id='e';
  assert v = 2, 'server-controlled version';
  update public.web_kit_private_entries set payload='{"id":"e","value":"stale"}' where entry_id='e' and version=1;
  get diagnostics changed = row_count;
  assert changed = 0, 'stale update';
end $$;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
do $$ begin
  assert (select count(*) from public.web_kit_private_trips) = 0, 'other user trip access';
  assert (select count(*) from public.web_kit_private_entries) = 0, 'other user entry access';
  begin
    insert into public.web_kit_private_trips(title,people) values ('Forbidden',array['B']);
    raise exception 'other user insert allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$ begin
  begin
    perform count(*) from public.web_kit_private_trips;
    raise exception 'anonymous select allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
