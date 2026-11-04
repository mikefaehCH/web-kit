\set ON_ERROR_STOP 1
insert into auth.users(id,raw_app_meta_data) values
 ('aaaaaaaa-1111-4111-8111-111111111111','{"web_kit_admin":true}'),
 ('bbbbbbbb-1111-4111-8111-111111111111','{"web_kit_admin":true}');
insert into public.web_kit_wa_batches(id,actor_id,message_hash) values ('aaaaaaaa-2222-4222-8222-222222222222','aaaaaaaa-1111-4111-8111-111111111111',repeat('a',64));
insert into public.web_kit_wa_batch_items(id,batch_id,request_key,position,chat_id) values
 ('aaaaaaaa-3333-4333-8333-333333333331','aaaaaaaa-2222-4222-8222-222222222222','aaaaaaaa-4444-4444-8444-444444444441',1,'41790000000@c.us'),
 ('aaaaaaaa-3333-4333-8333-333333333332','aaaaaaaa-2222-4222-8222-222222222222','aaaaaaaa-4444-4444-8444-444444444442',2,'41790000001@c.us');
do $$ begin
 assert not has_function_privilege('anon','public.web_kit_whatsapp_batch_create(uuid,uuid,text,jsonb)','execute');
 assert not has_function_privilege('authenticated','public.web_kit_whatsapp_batch_create(uuid,uuid,text,jsonb)','execute');
 assert not has_function_privilege('anon','public.web_kit_whatsapp_batch_claim(uuid,uuid)','execute');
 assert not has_function_privilege('authenticated','public.web_kit_whatsapp_batch_claim(uuid,uuid)','execute');
 assert not has_function_privilege('authenticated','public.web_kit_whatsapp_batch_finish(uuid,uuid,uuid,uuid,text,text)','execute');
 assert not has_table_privilege('service_role','public.web_kit_wa_batch_items','select');
 assert (select relrowsecurity from pg_class where oid='public.web_kit_wa_batch_items'::regclass);
end $$;
select set_config('request.jwt.claim.role','service_role',false) \g /dev/null
set role service_role;
do $$ declare b uuid:='aaaaaaaa-2222-4222-8222-222222222222'; a uuid:='aaaaaaaa-1111-4111-8111-111111111111'; i uuid:='aaaaaaaa-3333-4333-8333-333333333331'; k uuid:='aaaaaaaa-4444-4444-8444-444444444441'; r jsonb;
begin
 begin perform public.web_kit_whatsapp_batch_claim(b,'bbbbbbbb-1111-4111-8111-111111111111'); raise exception 'wrong owner accepted'; exception when insufficient_privilege then null; end;
 assert not public.web_kit_whatsapp_batch_create('cccccccc-2222-4222-8222-222222222222',a,repeat('a',64),'[]');
 assert not public.web_kit_whatsapp_batch_create('cccccccc-2222-4222-8222-222222222222',a,repeat('a',64),'["41790000000@c.us","41790000000@c.us"]');
 assert not public.web_kit_whatsapp_batch_create('cccccccc-2222-4222-8222-222222222222',a,repeat('a',64),'[42]');
 assert public.web_kit_whatsapp_batch_create('cccccccc-2222-4222-8222-222222222222',a,repeat('a',64),'["41790000003@c.us","120363123456789000@g.us"]');
 assert not public.web_kit_whatsapp_batch_create('cccccccc-2222-4222-8222-222222222222',a,repeat('a',64),'["41790000003@c.us"]');
 r:=public.web_kit_whatsapp_batch_claim(b,a); assert r->>'state'='claimed'; assert (r->>'item_id')::uuid=i;
 assert public.web_kit_whatsapp_batch_claim(b,a)->>'state'='blocked';
 assert not public.web_kit_whatsapp_batch_finish(b,a,i,k,'accepted',null);
 assert public.web_kit_whatsapp_batch_finish(b,a,i,k,'unknown',null);
 assert not public.web_kit_whatsapp_batch_finish(b,a,i,k,'accepted','FAKE');
 assert public.web_kit_whatsapp_batch_claim(b,a)->>'state'='blocked';
end $$;
reset role;
