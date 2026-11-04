-- DRAFT ONLY. Not a migration; never apply to production as-is.
-- Requires a separate creation API, access review and transactional tests.
begin;
create table public.web_kit_wa_batches (
  id uuid primary key,
  actor_id uuid not null,
  created_at timestamptz not null default now()
);
create table public.web_kit_wa_batch_items (
  id uuid primary key,
  batch_id uuid not null references public.web_kit_wa_batches(id),
  request_key uuid not null unique,
  position integer not null check (position >= 0),
  chat_id text not null check (chat_id ~ '^([0-9]{6,20}@c\.us|[0-9]{6,24}(-[0-9]{1,20})?@g\.us)$'),
  status text not null default 'queued' check (status in ('queued','pending','accepted','failed','unknown')),
  provider_id text,
  unique(batch_id, position),
  unique(batch_id, chat_id),
  check ((status = 'accepted') = (provider_id is not null)),
  check (provider_id is null or provider_id ~ '^[A-Za-z0-9._:@-]{1,128}$')
);
alter table public.web_kit_wa_batches enable row level security;
alter table public.web_kit_wa_batch_items enable row level security;
revoke all on public.web_kit_wa_batches, public.web_kit_wa_batch_items from public, anon, authenticated, service_role;

create function public.web_kit_whatsapp_batch_claim(p_batch uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.web_kit_wa_batch_items%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  if not exists (select 1 from auth.users u where u.id=p_actor and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now()) and u.raw_app_meta_data->>'web_kit_admin'='true') then raise exception 'forbidden' using errcode='42501'; end if;
  perform 1 from public.web_kit_wa_batches b where b.id=p_batch and b.actor_id=p_actor for update;
  if not found then raise exception 'forbidden' using errcode='42501'; end if;
  if exists(select 1 from public.web_kit_wa_batch_items i where i.batch_id=p_batch and i.status in ('pending','unknown')) then return jsonb_build_object('state','blocked'); end if;
  select * into item from public.web_kit_wa_batch_items i where i.batch_id=p_batch and i.status='queued' order by i.position limit 1;
  if not found then return jsonb_build_object('state','complete'); end if;
  update public.web_kit_wa_batch_items set status='pending' where id=item.id;
  return jsonb_build_object('state','claimed','item_id',item.id,'request_key',item.request_key,'chat_id',item.chat_id);
end $$;

create function public.web_kit_whatsapp_batch_finish(p_batch uuid,p_actor uuid,p_item uuid,p_key uuid,p_status text,p_provider_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  if not exists (select 1 from auth.users u where u.id=p_actor and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now()) and u.raw_app_meta_data->>'web_kit_admin'='true') then raise exception 'forbidden' using errcode='42501'; end if;
  perform 1 from public.web_kit_wa_batches b where b.id=p_batch and b.actor_id=p_actor for update;
  if not found then raise exception 'forbidden' using errcode='42501'; end if;
  if p_status not in ('accepted','failed','unknown') or p_status is null then return false; end if;
  if p_status='accepted' and (p_provider_id is null or p_provider_id !~ '^[A-Za-z0-9._:@-]{1,128}$') then return false; end if;
  if p_status <> 'accepted' and p_provider_id is not null then return false; end if;
  update public.web_kit_wa_batch_items set status=p_status, provider_id=p_provider_id where id=p_item and batch_id=p_batch and request_key=p_key and status='pending';
  return found;
end $$;
revoke all on function public.web_kit_whatsapp_batch_claim(uuid,uuid) from public, anon, authenticated;
revoke all on function public.web_kit_whatsapp_batch_finish(uuid,uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.web_kit_whatsapp_batch_claim(uuid,uuid) to service_role;
grant execute on function public.web_kit_whatsapp_batch_finish(uuid,uuid,uuid,uuid,text,text) to service_role;
commit;
