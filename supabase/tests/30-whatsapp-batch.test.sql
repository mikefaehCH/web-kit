\set ON_ERROR_STOP 1
insert into auth.users(id,raw_app_meta_data) values
 ('aaaaaaaa-1111-4111-8111-111111111111','{"web_kit_admin":true}'),
 ('bbbbbbbb-1111-4111-8111-111111111111','{"web_kit_admin":true}'),
 ('dddddddd-1111-4111-8111-111111111111','{"web_kit_admin":true}'),
 ('eeeeeeee-1111-4111-8111-111111111111','{"web_kit_admin":true}');
insert into public.web_kit_wa_batches(id,actor_id,message_hash) values ('aaaaaaaa-2222-4222-8222-222222222222','aaaaaaaa-1111-4111-8111-111111111111',repeat('a',64));
insert into public.web_kit_wa_batches(id,actor_id,message_hash) values ('aaaaaaaa-2222-4222-8222-222222222224','aaaaaaaa-1111-4111-8111-111111111111',repeat('c',64));
insert into public.web_kit_wa_batch_items(id,batch_id,request_key,position,chat_id,status,claimed_at) values ('aaaaaaaa-3333-4333-8333-333333333335','aaaaaaaa-2222-4222-8222-222222222224','aaaaaaaa-4444-4444-8444-444444444445',1,'41790000004@c.us','pending',now()-interval '6 minutes');
insert into public.web_kit_wa_batch_items(id,batch_id,request_key,position,chat_id) values
 ('aaaaaaaa-3333-4333-8333-333333333331','aaaaaaaa-2222-4222-8222-222222222222','aaaaaaaa-4444-4444-8444-444444444441',1,'41790000000@c.us'),
 ('aaaaaaaa-3333-4333-8333-333333333332','aaaaaaaa-2222-4222-8222-222222222222','aaaaaaaa-4444-4444-8444-444444444442',2,'41790000001@c.us');
do $$ begin
 assert not has_function_privilege('authenticated','public.web_kit_whatsapp_batch_list(uuid,uuid)','execute');
 assert not has_function_privilege('authenticated','public.web_kit_whatsapp_batch_resolve(uuid,uuid,uuid,boolean)','execute');
 assert not has_function_privilege('anon','public.web_kit_whatsapp_batch_inspect(uuid,uuid)','execute');
 assert not has_function_privilege('authenticated','public.web_kit_whatsapp_batch_inspect(uuid,uuid)','execute');
 assert not has_function_privilege('anon','public.web_kit_whatsapp_batch_create(uuid,uuid,text,jsonb)','execute');
 assert not has_function_privilege('authenticated','public.web_kit_whatsapp_batch_create(uuid,uuid,text,jsonb)','execute');
 assert not has_function_privilege('anon','public.web_kit_whatsapp_batch_claim(uuid,uuid,text)','execute');
 assert not has_function_privilege('authenticated','public.web_kit_whatsapp_batch_claim(uuid,uuid,text)','execute');
 assert not has_function_privilege('authenticated','public.web_kit_whatsapp_batch_finish(uuid,uuid,uuid,uuid,text,text)','execute');
 assert not has_table_privilege('service_role','public.web_kit_wa_batch_items','select');
 assert (select relrowsecurity from pg_class where oid='public.web_kit_wa_batch_items'::regclass);
end $$;
insert into public.web_kit_wa_batches(id,actor_id,message_hash,created_at)
select gen_random_uuid(),'eeeeeeee-1111-4111-8111-111111111111',repeat('b',64),now()-interval '2 hours' from generate_series(1,21);
select set_config('request.jwt.claim.role','service_role',false) \g /dev/null
set role service_role;
do $$ declare b uuid:='aaaaaaaa-2222-4222-8222-222222222222'; a uuid:='aaaaaaaa-1111-4111-8111-111111111111'; i uuid:='aaaaaaaa-3333-4333-8333-333333333331'; k uuid:='aaaaaaaa-4444-4444-8444-444444444441'; r jsonb;
begin
 begin perform public.web_kit_whatsapp_batch_claim(b,'bbbbbbbb-1111-4111-8111-111111111111',repeat('a',64)); raise exception 'wrong owner accepted'; exception when insufficient_privilege then null; end;
 assert not public.web_kit_whatsapp_batch_create('cccccccc-2222-4222-8222-222222222222',a,repeat('a',64),'[]');
 assert not public.web_kit_whatsapp_batch_create('cccccccc-2222-4222-8222-222222222222',a,repeat('a',64),'["41790000000@c.us","41790000000@c.us"]');
 assert not public.web_kit_whatsapp_batch_create('cccccccc-2222-4222-8222-222222222222',a,repeat('a',64),'[42]');
 assert public.web_kit_whatsapp_batch_create('cccccccc-2222-4222-8222-222222222222',a,repeat('a',64),'["41790000003@c.us","120363123456789000@g.us"]');
 assert not public.web_kit_whatsapp_batch_create('cccccccc-2222-4222-8222-222222222222',a,repeat('a',64),'["41790000003@c.us"]');
 begin perform public.web_kit_whatsapp_batch_claim(b,a,repeat('b',64)); raise exception 'mismatched message accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.web_kit_whatsapp_batch_inspect(b,'bbbbbbbb-1111-4111-8111-111111111111'); raise exception 'wrong owner could inspect'; exception when insufficient_privilege then null; end;
 r:=public.web_kit_whatsapp_batch_list(a);
 assert jsonb_array_length(r->'batches')=3;
 assert not (r->'batches'->0 ? 'message_hash');
 r:=public.web_kit_whatsapp_batch_list('bbbbbbbb-1111-4111-8111-111111111111');
 assert jsonb_array_length(r->'batches')=0;
 r:=public.web_kit_whatsapp_batch_inspect(b,a);
 assert jsonb_array_length(r->'items')=2;
 assert r->'items'->0->>'status'='queued';
 assert not (r->'items'->0 ? 'request_key');
 r:=public.web_kit_whatsapp_batch_claim(b,a,repeat('a',64)); assert r->>'state'='claimed'; assert (r->>'item_id')::uuid=i;
 assert public.web_kit_whatsapp_batch_claim(b,a,repeat('a',64))->>'state'='blocked';
 r:=public.web_kit_whatsapp_batch_inspect(b,a); assert not (r->'items'->0->>'review_available')::boolean;
 assert (public.web_kit_whatsapp_batch_inspect('aaaaaaaa-2222-4222-8222-222222222224',a)->'items'->0->>'review_available')::boolean;
 assert not public.web_kit_whatsapp_batch_resolve(b,a,i,true);
 assert public.web_kit_whatsapp_batch_resolve('aaaaaaaa-2222-4222-8222-222222222224',a,'aaaaaaaa-3333-4333-8333-333333333335',true);
 assert public.web_kit_whatsapp_batch_claim('aaaaaaaa-2222-4222-8222-222222222224',a,repeat('c',64))->>'state'='complete';
 assert not public.web_kit_whatsapp_batch_finish(b,a,i,k,'accepted',null);
 assert public.web_kit_whatsapp_batch_finish(b,a,i,k,'unknown',null);
 assert not public.web_kit_whatsapp_batch_finish(b,a,i,k,'accepted','FAKE');
 assert public.web_kit_whatsapp_batch_claim(b,a,repeat('a',64))->>'state'='blocked';
 r:=public.web_kit_whatsapp_batch_inspect(b,a); assert r->'items'->0->>'status'='unknown';
 assert not public.web_kit_whatsapp_batch_resolve(b,a,i,false);
 begin perform public.web_kit_whatsapp_batch_resolve(b,'bbbbbbbb-1111-4111-8111-111111111111',i,true); raise exception 'wrong owner could resolve'; exception when insufficient_privilege then null; end;
 assert public.web_kit_whatsapp_batch_resolve(b,a,i,true);
 assert not public.web_kit_whatsapp_batch_resolve(b,a,i,true);
 r:=public.web_kit_whatsapp_batch_inspect(b,a); assert r->'items'->0->>'status'='reviewed';
 r:=public.web_kit_whatsapp_batch_claim(b,a,repeat('a',64)); assert r->>'state'='claimed'; assert r->>'item_id'='aaaaaaaa-3333-4333-8333-333333333332';
end $$;
do $$ declare a uuid:='eeeeeeee-1111-4111-8111-111111111111'; first_page jsonb; second_page jsonb; cursor_id uuid;
begin
 first_page:=public.web_kit_whatsapp_batch_list(a); assert jsonb_array_length(first_page->'batches')=20;
 cursor_id:=(first_page->'batches'->19->>'batch_id')::uuid;
 second_page:=public.web_kit_whatsapp_batch_list(a,cursor_id); assert jsonb_array_length(second_page->'batches')=1;
 assert not ((first_page->'batches') @> (second_page->'batches'));
 begin perform public.web_kit_whatsapp_batch_list('bbbbbbbb-1111-4111-8111-111111111111',cursor_id); raise exception 'cross owner cursor accepted'; exception when invalid_parameter_value then null; end;
end $$;
-- Separate actor: quota permits 10 batch creations in one hour.
do $$ declare actor uuid:='bbbbbbbb-1111-4111-8111-111111111111'; ok_count integer:=0;
begin
  for n in 1..11 loop
    if public.web_kit_whatsapp_batch_create(gen_random_uuid(),actor,repeat('d',64),'["41790000000@c.us"]') then ok_count:=ok_count+1; end if;
  end loop;
  assert ok_count=10;
end $$;
-- Both entry points share the same ten-attempt quota.
do $$ declare a uuid:='dddddddd-1111-4111-8111-111111111111'; b uuid:='dddddddd-2222-4222-8222-222222222222'; r jsonb;
begin
  assert public.web_kit_whatsapp_batch_create(b,a,repeat('a',64),'["41790000005@c.us","41790000006@c.us"]');
  for n in 1..9 loop assert public.web_kit_whatsapp_claim(a,gen_random_uuid(),repeat('f',64)); end loop;
  r:=public.web_kit_whatsapp_batch_claim(b,a,repeat('a',64)); assert r->>'state'='claimed';
  assert public.web_kit_whatsapp_batch_finish(b,a,(r->>'item_id')::uuid,(r->>'request_key')::uuid,'failed',null);
  assert public.web_kit_whatsapp_batch_claim(b,a,repeat('a',64))->>'state'='rate_limited';
  assert not public.web_kit_whatsapp_claim(a,gen_random_uuid(),repeat('f',64));
end $$;
do $$ declare a uuid:='eeeeeeee-1111-4111-8111-111111111111'; b uuid:='eeeeeeee-2222-4222-8222-222222222222'; r jsonb;
begin
  assert public.web_kit_whatsapp_batch_create(b,a,repeat('a',64),'["41790000007@c.us"]');
  r:=public.web_kit_whatsapp_batch_claim(b,a,repeat('a',64)); assert r->>'state'='claimed';
  for n in 1..9 loop assert public.web_kit_whatsapp_claim(a,gen_random_uuid(),repeat('f',64)); end loop;
  assert not public.web_kit_whatsapp_claim(a,gen_random_uuid(),repeat('f',64));
end $$;

-- Project assignments are owner scoped and do not expose tables to clients.
do $$ declare a uuid:='aaaaaaaa-1111-4111-8111-111111111111'; b uuid:='bbbbbbbb-1111-4111-8111-111111111111'; r jsonb;
begin
  assert not has_table_privilege('authenticated','public.web_kit_wa_recipient_projects','select');
  assert not has_function_privilege('authenticated','public.web_kit_whatsapp_project_set_recipient(uuid,text,text,boolean)','execute');
  assert public.web_kit_whatsapp_project_set_recipient(a,'camino','41790000000@c.us',true);
  assert public.web_kit_whatsapp_project_set_recipient(a,'sommer','41790000000@c.us',true);
  assert public.web_kit_whatsapp_project_set_recipient(a,'camino','41790000000@c.us',true);
  r:=public.web_kit_whatsapp_project_recipients(a,'camino');
  assert jsonb_array_length(r)=1;
  assert jsonb_array_length(public.web_kit_whatsapp_project_recipients(b,'camino'))=0;
  assert not public.web_kit_whatsapp_project_set_recipient(a,'invalid slug','41790000000@c.us',true);
  assert not public.web_kit_whatsapp_project_set_recipient(a,'camino','invalid',true);
  assert public.web_kit_whatsapp_project_set_recipient(a,'camino','41790000000@c.us',false);
  assert jsonb_array_length(public.web_kit_whatsapp_project_recipients(a,'camino'))=0;
  assert jsonb_array_length(public.web_kit_whatsapp_project_recipients(a,'sommer'))=1;
end $$;

reset role;
