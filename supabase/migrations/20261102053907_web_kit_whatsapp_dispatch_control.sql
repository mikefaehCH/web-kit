-- Bereits produktiv angewendet (Projekt qoensghjemruqafrbmjd, Version 20261102053907).
-- Hier unverändert versioniert, damit Repository und Datenbank übereinstimmen.
-- Die Berechtigungen werden durch 20261102061405_web_kit_whatsapp_service_role_only.sql gehärtet.
create table if not exists public.web_kit_whatsapp_dispatches (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null,
 request_key uuid not null,
 message_hash text not null,
 status text not null default 'pending' check (status in ('pending','accepted','failed')),
 provider_message_id text,
 created_at timestamptz not null default now(),
 unique(actor_id,request_key)
);
create index if not exists web_kit_whatsapp_actor_created on public.web_kit_whatsapp_dispatches(actor_id,created_at desc);
alter table public.web_kit_whatsapp_dispatches enable row level security;
revoke all on public.web_kit_whatsapp_dispatches from anon,authenticated;
create or replace function public.web_kit_whatsapp_claim(p_actor uuid,p_key uuid,p_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare recent_count integer;
begin
 if auth.uid() is distinct from p_actor then return false; end if;
 if not exists(select 1 from auth.users where id=p_actor and raw_app_meta_data->>'web_kit_admin'='true') then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 if exists(select 1 from public.web_kit_whatsapp_dispatches where actor_id=p_actor and request_key=p_key) then return false; end if;
 select count(*) into recent_count from public.web_kit_whatsapp_dispatches where actor_id=p_actor and created_at>now()-interval '1 hour';
 if recent_count>=10 then return false; end if;
 insert into public.web_kit_whatsapp_dispatches(actor_id,request_key,message_hash) values(p_actor,p_key,p_hash);
 return true;
end $$;
revoke all on function public.web_kit_whatsapp_claim(uuid,uuid,text) from public,anon;
grant execute on function public.web_kit_whatsapp_claim(uuid,uuid,text) to authenticated;
