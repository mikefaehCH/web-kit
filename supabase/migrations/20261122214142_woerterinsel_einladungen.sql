begin;
alter function public.woerterinsel(text,jsonb) set schema woerterinsel;
revoke all on function woerterinsel.woerterinsel(text,jsonb) from public,anon,authenticated;
create table woerterinsel.invitation(code uuid primary key default gen_random_uuid(), family uuid not null references woerterinsel.family, email text not null, expires timestamptz not null default now()+interval '7 days', accepted boolean not null default false);
create unique index woerterinsel_one_open_prize on woerterinsel.claim(family,prize) where status='offen';
create function public.woerterinsel(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); f uuid; r text; mail text; t uuid; e jsonb;
begin
 if u is null then raise exception 'Anmeldung erforderlich';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select family,role into f,r from woerterinsel.member where uid=u;
 if action='invite' then
  if r is distinct from 'parent' then raise exception 'Elternzugang erforderlich';end if;
  mail:=lower(trim(payload->>'email'));
  if mail is null or length(mail)>254 or mail not like '%_@_%.__%' then raise exception 'Adresse prüfen';end if;
  insert into woerterinsel.invitation(family,email) values(f,mail) returning code into t;
  return jsonb_build_object('code',t);
 end if;
 if action='join' and f is null then
  select lower(email) into mail from auth.users where id=u and email_confirmed_at is not null;
  if mail is null or mail like '%@kind.invalid' then raise exception 'Bestätigte Elternadresse erforderlich';end if;
  if payload ? 'code' then
   update woerterinsel.invitation set accepted=true where code=(payload->>'code')::uuid and email=mail and not accepted and expires>now() returning family into f;
   if f is null then raise exception 'Einladung ungültig oder abgelaufen';end if;
  elsif payload->>'create'='yes' then
   insert into woerterinsel.family default values returning id into f;
  else raise exception 'Familie auswählen';end if;
  insert into woerterinsel.member values(u,f,'parent');
 end if;
 if action='sync' then
  for e in select value from jsonb_array_elements(payload->'events') loop
   if not (case e->>'place'
    when 'atelier' then e->>'kind' in ('atelier','reverse') and e->>'target' in ('m','a','i','l','o','p')
    when 'wald' then e->>'kind'='forest' and e->>'target' in ('Maus','Apfel','Biene','Drache')
    when 'bach' then e->>'kind'='brook' and e->>'target' in ('ma','mi','la','li','mo','lo')
    when 'post' then e->>'kind'='post' and e->>'target' in ('M','P','O','L','a','m','i','p')
    else false end) then raise exception 'Unbekannter Lernschritt';end if;
  end loop;
 end if;
 return woerterinsel.woerterinsel(action,payload);
end;$$;
revoke all on function public.woerterinsel(text,jsonb) from public,anon;
grant execute on function public.woerterinsel(text,jsonb) to authenticated;
commit;
