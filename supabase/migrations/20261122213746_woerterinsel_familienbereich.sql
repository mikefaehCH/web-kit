-- Isolated family data. Apply only after separate production approval.
begin;
create schema woerterinsel;
revoke all on schema woerterinsel from public, anon, authenticated;
create table woerterinsel.family(id uuid primary key default gen_random_uuid());
create table woerterinsel.member(uid uuid primary key references auth.users(id) on delete cascade, family uuid not null references woerterinsel.family, role text not null check(role in ('parent','child')));
create table woerterinsel.invite(email text primary key, family uuid not null references woerterinsel.family);
create table woerterinsel.profile(family uuid primary key references woerterinsel.family, data jsonb not null default '{}');
create table woerterinsel.event(id uuid primary key, family uuid not null references woerterinsel.family, data jsonb not null);
create table woerterinsel.prize(id uuid primary key default gen_random_uuid(), family uuid not null references woerterinsel.family, title text not null, price integer not null check(price between 1 and 10000), image text not null default 'eule', available boolean not null default true);
create table woerterinsel.claim(id uuid primary key, family uuid not null references woerterinsel.family, prize uuid references woerterinsel.prize, title text not null, cost integer not null, status text not null default 'offen' check(status in ('offen','erfüllt','storniert')));
create function public.woerterinsel(action text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); f uuid; r text; confirmed_email text; p woerterinsel.prize; item jsonb; available integer; who uuid; child_role text;
begin
 if u is null then raise exception 'Anmeldung erforderlich'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select family,role into f,r from woerterinsel.member where uid=u;
 if action='join' and f is null then

  select lower(a.email) into confirmed_email from auth.users a where a.id=u and a.email_confirmed_at is not null;
  if confirmed_email is null or confirmed_email like '%@kind.invalid' then raise exception 'E-Mail fehlt'; end if;
  delete from woerterinsel.invite i where i.email=confirmed_email returning family into f;
  if f is null then insert into woerterinsel.family default values returning id into f; end if;
  insert into woerterinsel.member values(u,f,'parent'); r:='parent';
 end if;
 if f is null then raise exception 'Kein Familienzugang'; end if;
 perform 1 from woerterinsel.family where id=f for update;
 if action in ('invite','prize','toggle','status','child_access') and r<>'parent' then raise exception 'Elternzugang erforderlich';end if;
 case action
 when 'invite' then
  if length(payload->>'email') not between 3 and 254 then raise exception 'E-Mail ungültig';end if;
  insert into woerterinsel.invite values(lower(trim(payload->>'email')),f);
 when 'child_access' then
  return jsonb_build_object('family',f,'children',(select coalesce(jsonb_agg(m.uid),'[]') from woerterinsel.member m where m.family=f and m.role='child'));
 when 'sync' then
  if jsonb_array_length(payload->'events')>200 then raise exception 'Zu viele Einträge';end if;
  for item in select value from jsonb_array_elements(payload->'events') loop
   if not (item ?& array['place','kind','target','helped','at','id']) or item->>'place' not in ('wald','atelier','bach','post') or item->>'kind' not in ('forest','atelier','reverse','brook','post') or length(item::text)>900 or length(item->>'target') not between 1 and 18 or jsonb_typeof(item->'helped') is distinct from 'boolean' then raise exception 'Unbekannte Übung'; end if;
   insert into woerterinsel.event values((item->>'id')::uuid,f,item-'coins') on conflict(id) do nothing;
  end loop;
 when 'profile' then
  if r='child' and payload ? 'school' then raise exception 'Elternzugang erforderlich';end if;
  if jsonb_typeof(payload)<>'object' or exists(select 1 from jsonb_object_keys(payload) k where k not in ('school','pet','name','mail_name','mail_card','mail_words','mail_voices')) or octet_length(payload::text)>3000000 then raise exception 'Profil zu gross';end if;
  insert into woerterinsel.profile values(f,payload) on conflict(family) do update set data=woerterinsel.profile.data||excluded.data;
 when 'prize' then
  insert into woerterinsel.prize(family,title,price,image) values(f,left(payload->>'title',80),(payload->>'price')::int,coalesce(payload->>'image','eule'));
 when 'toggle' then
  update woerterinsel.prize set available=not woerterinsel.prize.available where family=f and id=(payload->>'id')::uuid;
 when 'claim' then
  if not exists(select 1 from woerterinsel.claim where id=(payload->>'request')::uuid and family=f) then
   select * into strict p from woerterinsel.prize where id=(payload->>'id')::uuid and family=f and woerterinsel.prize.available;
   select (select count(*) from woerterinsel.event where family=f)-coalesce(sum(cost),0) into available from woerterinsel.claim where family=f and status<>'storniert';
   if available<p.price then raise exception 'Zu wenig Münzen';end if;
   insert into woerterinsel.claim(id,family,prize,title,cost) values((payload->>'request')::uuid,f,p.id,p.title,p.price);
  end if;
 when 'status' then
  if payload->>'status' not in ('erfüllt','storniert') then raise exception 'Status ungültig';end if;
  update woerterinsel.claim set status=payload->>'status' where family=f and id=(payload->>'id')::uuid and status='offen';
 when 'join' then null;
 when 'read' then null;
 else raise exception 'Unbekannte Aktion';
 end case;
 return jsonb_build_object('family',f,'role',r,'profile',coalesce((select data from woerterinsel.profile where family=f),'{}'),'events',(select coalesce(jsonb_agg(data),'[]') from woerterinsel.event where family=f),'prizes',(select coalesce(jsonb_agg(to_jsonb(x)-'family'),'[]') from woerterinsel.prize x where family=f),'claims',(select coalesce(jsonb_agg(to_jsonb(x)-'family'),'[]') from woerterinsel.claim x where family=f));
end;$$;
revoke all on function public.woerterinsel(text,jsonb) from public,anon;
grant execute on function public.woerterinsel(text,jsonb) to authenticated;
create function public.woerterinsel_bind_child(parent_uid uuid,child_uid uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into woerterinsel.member select child_uid,family,'child' from woerterinsel.member where uid=parent_uid and role='parent';
 if not found then raise exception 'Elternzugang fehlt'; end if;
end;$$;
revoke all on function public.woerterinsel_bind_child(uuid,uuid) from public,anon,authenticated;
grant execute on function public.woerterinsel_bind_child(uuid,uuid) to service_role;
commit;
