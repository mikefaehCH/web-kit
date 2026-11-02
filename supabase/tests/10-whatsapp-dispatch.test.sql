-- Sicherheitstests Versandkontrolle (nach allen Migrationen ausführen, psql -v ON_ERROR_STOP=1).
\set ON_ERROR_STOP 1
set client_min_messages = notice;

insert into auth.users (id, raw_app_meta_data, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', '{"web_kit_admin": true}', '{}'),        -- Admin
  ('22222222-2222-4222-8222-222222222222', '{}', '{"web_kit_admin": true}'),        -- Nicht-Admin (nur user_metadata!)
  ('33333333-3333-4333-8333-333333333333', '{"web_kit_admin": true}', '{}');        -- Admin, später gesperrt
update auth.users set banned_until = now() + interval '1 day' where id = '33333333-3333-4333-8333-333333333333';

create or replace function pg_temp.as_role(r text, sub uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', r, 'sub', sub)::text, false);
  execute format('set role %I', r);
end $$;

-- T1: Rechte-Katalog
do $$ begin
  assert not has_function_privilege('anon','public.web_kit_whatsapp_claim(uuid,uuid,text)','execute'), 'T1 anon claim';
  assert not has_function_privilege('authenticated','public.web_kit_whatsapp_claim(uuid,uuid,text)','execute'), 'T1 auth claim';
  assert not has_function_privilege('anon','public.web_kit_whatsapp_finish(uuid,uuid,text,text)','execute'), 'T1 anon finish';
  assert not has_function_privilege('authenticated','public.web_kit_whatsapp_finish(uuid,uuid,text,text)','execute'), 'T1 auth finish';
  assert has_function_privilege('service_role','public.web_kit_whatsapp_claim(uuid,uuid,text)','execute'), 'T1 sr claim';
  assert has_function_privilege('service_role','public.web_kit_whatsapp_finish(uuid,uuid,text,text)','execute'), 'T1 sr finish';
  assert not exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.proname in ('web_kit_whatsapp_claim','web_kit_whatsapp_finish') and a.grantee = 0), 'T1 PUBLIC execute';
  assert not has_table_privilege('anon','public.web_kit_whatsapp_dispatches','select,insert,update,delete'), 'T1 anon table';
  assert not has_table_privilege('authenticated','public.web_kit_whatsapp_dispatches','select,insert,update,delete'), 'T1 auth table';
  assert not has_table_privilege('service_role','public.web_kit_whatsapp_dispatches','insert,update,delete,truncate'), 'T1 sr write';
  assert has_table_privilege('service_role','public.web_kit_whatsapp_dispatches','select'), 'T1 sr select';
  assert (select relrowsecurity from pg_class where oid='public.web_kit_whatsapp_dispatches'::regclass), 'T1 RLS';
  assert (select count(*) from pg_policies where tablename='web_kit_whatsapp_dispatches') = 0, 'T1 keine Policies';
  raise notice 'T1 Rechte ok';
end $$;

-- T2: authenticated (Admin mit eigenem JWT) kann claim/finish nicht direkt aufrufen
select pg_temp.as_role('authenticated','11111111-1111-4111-8111-111111111111') \g /dev/null
do $$ begin
  begin perform public.web_kit_whatsapp_claim('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000001',repeat('a',64));
    raise exception 'T2 claim hätte scheitern müssen';
  exception when insufficient_privilege then null; end;
  begin perform public.web_kit_whatsapp_finish('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000001','accepted','FAKE');
    raise exception 'T2 finish hätte scheitern müssen';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.web_kit_whatsapp_dispatches;
    raise exception 'T2 select hätte scheitern müssen';
  exception when insufficient_privilege then null; end;
  begin insert into public.web_kit_whatsapp_dispatches(actor_id,request_key,message_hash) values ('11111111-1111-4111-8111-111111111111',gen_random_uuid(),repeat('a',64));
    raise exception 'T2 insert hätte scheitern müssen';
  exception when insufficient_privilege then null; end;
  raise notice 'T2 authenticated gesperrt';
end $$;
reset role;

-- T3: anon ebenso
select pg_temp.as_role('anon', null) \g /dev/null
do $$ begin
  begin perform public.web_kit_whatsapp_finish('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000001','accepted','FAKE');
    raise exception 'T3 finish hätte scheitern müssen';
  exception when insufficient_privilege then null; end;
  raise notice 'T3 anon gesperrt';
end $$;
reset role;

-- T4: Defense in Depth – EXECUTE-Recht allein genügt nicht ohne service_role-JWT
grant execute on function public.web_kit_whatsapp_finish(uuid,uuid,text,text) to authenticated;
select pg_temp.as_role('authenticated','11111111-1111-4111-8111-111111111111') \g /dev/null
do $$ begin
  begin perform public.web_kit_whatsapp_finish('11111111-1111-4111-8111-111111111111','aaaaaaaa-0000-4000-8000-000000000001','accepted','FAKE');
    raise exception 'T4 interne Rollenprüfung fehlt';
  exception when insufficient_privilege then null; end;
  raise notice 'T4 interne Rollenprüfung ok';
end $$;
reset role;
revoke execute on function public.web_kit_whatsapp_finish(uuid,uuid,text,text) from authenticated;

-- T5: service_role – legitimer Ablauf, Idempotenz, Statusschutz
select pg_temp.as_role('service_role', null) \g /dev/null
do $$
declare a uuid := '11111111-1111-4111-8111-111111111111'; k uuid := 'bbbbbbbb-0000-4000-8000-000000000001'; h text := repeat('b',64);
begin
  assert public.web_kit_whatsapp_claim(a,k,h) = true, 'T5 claim';
  assert public.web_kit_whatsapp_claim(a,k,h) = false, 'T5 Replay gleiche Request-ID';
  assert public.web_kit_whatsapp_finish(a,k,'delivered','X') = false, 'T5 ungültiger Status';
  assert public.web_kit_whatsapp_finish(a,k,'accepted',null) = false, 'T5 accepted ohne Provider-ID';
  assert public.web_kit_whatsapp_finish(a,k,'accepted','bad id; drop') = false, 'T5 Provider-ID Format';
  assert public.web_kit_whatsapp_finish(a,k,'pending',null) = false, 'T5 zurück auf pending';
  assert public.web_kit_whatsapp_finish(a,k,'accepted','BAE5F4886AD4B04E') = true, 'T5 finish accepted';
  assert public.web_kit_whatsapp_finish(a,k,'failed',null) = false, 'T5 Endstatus überschreiben';
  assert public.web_kit_whatsapp_finish(a,'bbbbbbbb-0000-4000-8000-0000000000ff','accepted','X1') = false, 'T5 unbekannter Auftrag';
  assert (select status from public.web_kit_whatsapp_dispatches where request_key=k) = 'accepted', 'T5 Status';
  assert (select finished_at is not null from public.web_kit_whatsapp_dispatches where request_key=k), 'T5 finished_at';
  -- Timeout-Fall
  assert public.web_kit_whatsapp_claim(a,'bbbbbbbb-0000-4000-8000-000000000002',h) = true, 'T5 claim 2';
  assert public.web_kit_whatsapp_finish(a,'bbbbbbbb-0000-4000-8000-000000000002','unknown',null) = true, 'T5 unknown';
  assert public.web_kit_whatsapp_claim(a,'bbbbbbbb-0000-4000-8000-000000000002',h) = false, 'T5 kein Neuversand nach unknown';
  -- Eingabevalidierung
  assert public.web_kit_whatsapp_claim(a,gen_random_uuid(),'nothex') = false, 'T5 Hash-Format';
  assert public.web_kit_whatsapp_claim(a,null,h) = false, 'T5 null key';
  raise notice 'T5 Ablauf ok';
end $$;

-- T6: Nicht-Admins (auch mit user_metadata-Flag), gesperrte und unbekannte Benutzer
do $$ begin
  assert public.web_kit_whatsapp_claim('22222222-2222-4222-8222-222222222222',gen_random_uuid(),repeat('c',64)) = false, 'T6 user_metadata';
  assert public.web_kit_whatsapp_claim('33333333-3333-4333-8333-333333333333',gen_random_uuid(),repeat('c',64)) = false, 'T6 gesperrt';
  assert public.web_kit_whatsapp_claim('44444444-4444-4444-8444-444444444444',gen_random_uuid(),repeat('c',64)) = false, 'T6 unbekannt';
  raise notice 'T6 Nicht-Admins ok';
end $$;

-- T7: service_role darf Protokoll nicht direkt ändern oder löschen
do $$ begin
  begin update public.web_kit_whatsapp_dispatches set status='failed';
    raise exception 'T7 update hätte scheitern müssen';
  exception when insufficient_privilege then null; end;
  begin delete from public.web_kit_whatsapp_dispatches;
    raise exception 'T7 delete hätte scheitern müssen';
  exception when insufficient_privilege then null; end;
  raise notice 'T7 append-only ok';
end $$;

-- T8: Rate-Limit 10 pro Admin und Stunde
do $$
declare a uuid := '11111111-1111-4111-8111-111111111111'; n int; ok int := 0;
begin
  select count(*) into n from public.web_kit_whatsapp_dispatches where actor_id=a;
  for i in 1..15 loop
    if public.web_kit_whatsapp_claim(a, gen_random_uuid(), repeat('d',64)) then ok := ok + 1; end if;
  end loop;
  assert n + ok = 10, format('T8 erwartet 10 total, erhalten %s', n + ok);
  raise notice 'T8 Rate-Limit ok';
end $$;
reset role;

-- T9: auch der Tabelleneigentümer kann Endstatus nicht überschreiben (Trigger)
do $$ begin
  begin update public.web_kit_whatsapp_dispatches set status='failed', provider_message_id=null where status='accepted';
    raise exception 'T9 Trigger fehlt';
  exception when insufficient_privilege then null; end;
  begin delete from public.web_kit_whatsapp_dispatches where status='accepted';
    raise exception 'T9 Delete-Trigger fehlt';
  exception when insufficient_privilege then null; end;
  raise notice 'T9 Trigger ok';
end $$;
