-- Isolated CI database. All fixtures and changes to the auth stub are rolled back.
begin;
alter table auth.users add column if not exists email text, add column if not exists email_confirmed_at timestamptz;
do $$
declare p uuid:=gen_random_uuid(); k uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); f uuid; token uuid; reward uuid; redemption uuid:=gen_random_uuid(); trial jsonb; s jsonb;
begin
 insert into auth.users(id,email,email_confirmed_at) values(p,'a@example.org',now()),(p2,'b@example.org',now()),(k,'kid@kind.invalid',now());
 perform set_config('request.jwt.claim.sub',p::text,true);
 f:=(public.woerterinsel('join','{"create":"yes"}')->>'family')::uuid;
 token:=(public.woerterinsel('invite','{"email":"b@example.org"}')->>'code')::uuid;
 reward:=(public.woerterinsel('prize','{"title":"Geschichte","price":1}')->'prizes'->0->>'id')::uuid;
 perform public.woerterinsel_bind_child(p,k);
 perform set_config('request.jwt.claim.sub',k::text,true);
 trial:=jsonb_build_object('events',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'at',1,'place','atelier','kind','atelier','target','m','helped',true)));
 perform public.woerterinsel('sync',trial);
 s:=public.woerterinsel('sync',trial);
 if jsonb_array_length(s->'events')<>1 then raise exception 'duplicate event';end if;
 perform public.woerterinsel('claim',jsonb_build_object('id',reward,'request',redemption));
 s:=public.woerterinsel('claim',jsonb_build_object('id',reward,'request',redemption));
 if jsonb_array_length(s->'claims')<>1 then raise exception 'duplicate claim';end if;
 perform set_config('request.jwt.claim.sub',p2::text,true);
 s:=public.woerterinsel('join',jsonb_build_object('code',token));
 if (s->>'family')::uuid<>f or jsonb_array_length(s->'claims')<>1 then raise exception 'family join';end if;
 s:=public.woerterinsel('status',jsonb_build_object('id',redemption,'status','storniert'));
 if s->'claims'->0->>'status'<>'storniert' then raise exception 'refund';end if;
 if has_function_privilege('anon','public.woerterinsel(text,jsonb)','execute') or has_schema_privilege('authenticated','woerterinsel','usage') then raise exception 'scope';end if;
end;$$;
rollback;
