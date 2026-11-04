-- DRAFT ONLY. Not a migration; never apply to production as-is.
-- Requires a separate creation API, access review and transactional tests.
begin;
create table public.web_kit_wa_batches (
  id uuid primary key,
  actor_id uuid not null,
  message_hash text not null check (message_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create table public.web_kit_wa_batch_items (
  id uuid primary key,
  batch_id uuid not null references public.web_kit_wa_batches(id),
  request_key uuid not null unique,
  position integer not null check (position >= 0),
  chat_id text not null check (chat_id ~ '^([0-9]{6,20}@c\.us|[0-9]{6,24}(-[0-9]{1,20})?@g\.us)$'),
  status text not null default 'queued' check (status in ('queued','pending','accepted','failed','unknown','reviewed')),
  provider_id text,
  claimed_at timestamptz,
  reviewed_at timestamptz,
  unique(batch_id, position),
  unique(batch_id, chat_id),
  check ((status = 'queued') = (claimed_at is null)),
  check ((status = 'accepted') = (provider_id is not null)),
  check ((status = 'reviewed') = (reviewed_at is not null)),
  check (provider_id is null or provider_id ~ '^[A-Za-z0-9._:@-]{1,128}$')
);
alter table public.web_kit_wa_batches enable row level security;
alter table public.web_kit_wa_batch_items enable row level security;
revoke all on public.web_kit_wa_batches, public.web_kit_wa_batch_items from public, anon, authenticated, service_role;

create function public.web_kit_whatsapp_batch_create(p_batch uuid,p_actor uuid,p_message_hash text,p_chats jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer; recent_count integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  if not exists (select 1 from auth.users u where u.id=p_actor and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now()) and u.raw_app_meta_data->>'web_kit_admin'='true') then raise exception 'forbidden' using errcode='42501'; end if;
  if p_batch is null or p_message_hash is null or p_message_hash !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_chats) is distinct from 'array' then return false; end if;
  n:=jsonb_array_length(p_chats);
  if n < 1 or n > 10 then return false; end if;
  if exists(select 1 from jsonb_array_elements(p_chats) x where jsonb_typeof(x) <> 'string' or (x #>> '{}') !~ '^([0-9]{6,20}@c[.]us|[0-9]{6,24}(-[0-9]{1,20})?@g[.]us)$') then return false; end if;
  if (select count(distinct x) from jsonb_array_elements_text(p_chats) x) <> n then return false; end if;
  -- Serialises creations for an actor; retry IDs never create new rows.
  perform pg_advisory_xact_lock(hashtextextended('web_kit_wa_batch_create:' || p_actor::text,0));
  select count(*) into recent_count from public.web_kit_wa_batches where actor_id=p_actor and created_at > now()-interval '1 hour';
  if recent_count >= 10 then return false; end if;
  insert into public.web_kit_wa_batches(id,actor_id,message_hash) values (p_batch,p_actor,p_message_hash) on conflict(id) do nothing;
  if not found then return false; end if;
  insert into public.web_kit_wa_batch_items(id,batch_id,request_key,position,chat_id)
    select gen_random_uuid(),p_batch,gen_random_uuid(),ord::integer,chat from jsonb_array_elements_text(p_chats) with ordinality as v(chat,ord);
  return true;
end $$;
revoke all on function public.web_kit_whatsapp_batch_create(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.web_kit_whatsapp_batch_create(uuid,uuid,text,jsonb) to service_role;

-- Find recent batches for this actor after a browser/device restart.
create function public.web_kit_whatsapp_batch_list(p_actor uuid,p_before uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; cursor_time timestamptz;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  if not exists (select 1 from auth.users u where u.id=p_actor and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now()) and u.raw_app_meta_data->>'web_kit_admin'='true') then raise exception 'forbidden' using errcode='42501'; end if;
  if p_before is not null then
    select created_at into cursor_time from public.web_kit_wa_batches where id=p_before and actor_id=p_actor;
    if not found then raise exception 'invalid cursor' using errcode='22023'; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('batch_id',x.id,'created_at',x.created_at) order by x.created_at desc,x.id desc),'[]'::jsonb)
  into result from (select id,created_at from public.web_kit_wa_batches where actor_id=p_actor and (p_before is null or (created_at,id)<(cursor_time,p_before)) order by created_at desc,id desc limit 20) x;
  return jsonb_build_object('batches',result);
end $$;
revoke all on function public.web_kit_whatsapp_batch_list(uuid,uuid) from public, anon, authenticated;
grant execute on function public.web_kit_whatsapp_batch_list(uuid,uuid) to service_role;

-- Status inspection returns no message, token, request key or provider ID.
create function public.web_kit_whatsapp_batch_inspect(p_batch uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  if not exists (select 1 from auth.users u where u.id=p_actor and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now()) and u.raw_app_meta_data->>'web_kit_admin'='true') then raise exception 'forbidden' using errcode='42501'; end if;
  if not exists (select 1 from public.web_kit_wa_batches b where b.id=p_batch and b.actor_id=p_actor) then raise exception 'forbidden' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('item_id',i.id,'chat_id',i.chat_id,'status',i.status,'review_available',(i.status='unknown' or (i.status='pending' and i.claimed_at < now()-interval '5 minutes'))) order by i.position),'[]'::jsonb)
    into result from public.web_kit_wa_batch_items i where i.batch_id=p_batch;
  return jsonb_build_object('items',result);
end $$;
revoke all on function public.web_kit_whatsapp_batch_inspect(uuid,uuid) from public, anon, authenticated;
grant execute on function public.web_kit_whatsapp_batch_inspect(uuid,uuid) to service_role;

-- A reviewed unknown or stale pending item is never requeued. This only unblocks other recipients.
-- The eventual authenticated API must require explicit, informed user confirmation.
create function public.web_kit_whatsapp_batch_resolve(p_batch uuid,p_actor uuid,p_item uuid,p_confirm boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  if not exists (select 1 from auth.users u where u.id=p_actor and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now()) and u.raw_app_meta_data->>'web_kit_admin'='true') then raise exception 'forbidden' using errcode='42501'; end if;
  perform 1 from public.web_kit_wa_batches b where b.id=p_batch and b.actor_id=p_actor for update;
  if not found then raise exception 'forbidden' using errcode='42501'; end if;
  if p_confirm is distinct from true then return false; end if;
  update public.web_kit_wa_batch_items set status='reviewed', reviewed_at=now() where batch_id=p_batch and id=p_item and (status='unknown' or (status='pending' and claimed_at < now()-interval '5 minutes'));
  return found;
end $$;
revoke all on function public.web_kit_whatsapp_batch_resolve(uuid,uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.web_kit_whatsapp_batch_resolve(uuid,uuid,uuid,boolean) to service_role;

create function public.web_kit_whatsapp_batch_claim(p_batch uuid, p_actor uuid, p_message_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.web_kit_wa_batch_items%rowtype; recent_count integer;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  if not exists (select 1 from auth.users u where u.id=p_actor and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now()) and u.raw_app_meta_data->>'web_kit_admin'='true') then raise exception 'forbidden' using errcode='42501'; end if;
  -- This is the same actor lock used by the existing legacy sender.
  perform pg_advisory_xact_lock(hashtextextended('web_kit_whatsapp:' || p_actor::text,0));
  perform 1 from public.web_kit_wa_batches b where b.id=p_batch and b.actor_id=p_actor for update;
  if not found then raise exception 'forbidden' using errcode='42501'; end if;
  if p_message_hash is null or not exists (select 1 from public.web_kit_wa_batches where id=p_batch and message_hash=p_message_hash) then raise exception 'message mismatch' using errcode='22023'; end if;
  if exists(select 1 from public.web_kit_wa_batch_items i where i.batch_id=p_batch and i.status in ('pending','unknown')) then return jsonb_build_object('state','blocked'); end if;
  select * into item from public.web_kit_wa_batch_items i where i.batch_id=p_batch and i.status='queued' order by i.position limit 1;
  if not found then return jsonb_build_object('state','complete'); end if;
  select (select count(*) from public.web_kit_whatsapp_dispatches d where d.actor_id=p_actor and d.created_at > now()-interval '1 hour')
       + (select count(*) from public.web_kit_wa_batch_items i join public.web_kit_wa_batches b on b.id=i.batch_id where b.actor_id=p_actor and i.claimed_at > now()-interval '1 hour')
    into recent_count;
  if recent_count >= 10 then return jsonb_build_object('state','rate_limited'); end if;
  update public.web_kit_wa_batch_items set status='pending', claimed_at=now() where id=item.id;
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
revoke all on function public.web_kit_whatsapp_batch_claim(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.web_kit_whatsapp_batch_finish(uuid,uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.web_kit_whatsapp_batch_claim(uuid,uuid,text) to service_role;
grant execute on function public.web_kit_whatsapp_batch_finish(uuid,uuid,uuid,uuid,text,text) to service_role;
-- Pending design: extend the legacy limit to count batch dispatch attempts under the same actor lock.
create or replace function public.web_kit_whatsapp_claim(p_actor uuid, p_key uuid, p_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare recent_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_actor is null or p_key is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  -- Admin-Recht zusätzlich in der Datenbank prüfen (vertrauenswürdige app_metadata, nicht user_metadata).
  if not exists (
    select 1 from auth.users u
    where u.id = p_actor
      and u.raw_app_meta_data ->> 'web_kit_admin' = 'true'
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
  ) then
    return false;
  end if;
  -- Serialisiert parallele Versuche desselben Admins (Idempotenz und Rate-Limit atomar).
  perform pg_advisory_xact_lock(hashtextextended('web_kit_whatsapp:' || p_actor::text, 0));
  if exists (select 1 from public.web_kit_whatsapp_dispatches where actor_id = p_actor and request_key = p_key) then
    return false;
  end if;
  select count(*) into recent_count from public.web_kit_whatsapp_dispatches
   where actor_id = p_actor and created_at > now() - interval '1 hour';
  select recent_count + count(*) into recent_count from public.web_kit_wa_batch_items i join public.web_kit_wa_batches b on b.id=i.batch_id where b.actor_id=p_actor and i.claimed_at > now()-interval '1 hour';
  if recent_count >= 10 then
    return false;
  end if;
  insert into public.web_kit_whatsapp_dispatches (actor_id, request_key, message_hash)
  values (p_actor, p_key, p_hash);
  return true;
end $$;



-- Private project associations; this does not mutate provider contacts.
create table public.web_kit_wa_recipient_projects (
  actor_id uuid not null,
  project_slug text not null check (project_slug ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
  chat_id text not null check (chat_id ~ '^([0-9]{6,20}@c[.]us|[0-9]{6,24}(-[0-9]{1,20})?@g[.]us)$'),
  created_at timestamptz not null default now(),
  primary key (actor_id,project_slug,chat_id)
);
alter table public.web_kit_wa_recipient_projects enable row level security;
revoke all on public.web_kit_wa_recipient_projects from public, anon, authenticated, service_role;

create function public.web_kit_whatsapp_project_recipients(p_actor uuid,p_project text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' or not exists (
    select 1 from auth.users u where u.id=p_actor and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
      and u.raw_app_meta_data->>'web_kit_admin'='true'
  ) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_project is null or p_project !~ '^[a-z0-9][a-z0-9-]{0,47}$' then raise exception 'invalid project' using errcode='22023'; end if;
  select coalesce(jsonb_agg(chat_id order by chat_id),'[]'::jsonb) into result
    from public.web_kit_wa_recipient_projects where actor_id=p_actor and project_slug=p_project;
  return result;
end $$;

create function public.web_kit_whatsapp_project_set_recipient(p_actor uuid,p_project text,p_chat text,p_selected boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' or not exists (
    select 1 from auth.users u where u.id=p_actor and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
      and u.raw_app_meta_data->>'web_kit_admin'='true'
  ) then raise exception 'forbidden' using errcode='42501'; end if;
  if p_project is null or p_project !~ '^[a-z0-9][a-z0-9-]{0,47}$' or p_chat is null
    or p_chat !~ '^([0-9]{6,20}@c[.]us|[0-9]{6,24}(-[0-9]{1,20})?@g[.]us)$'
    or p_selected is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('web_kit_wa_projects:' || p_actor::text,0));
  if p_selected then
    if (select count(*) from public.web_kit_wa_recipient_projects where actor_id=p_actor) >= 1000
       and not exists(select 1 from public.web_kit_wa_recipient_projects where actor_id=p_actor and project_slug=p_project and chat_id=p_chat)
       then return false; end if;
    insert into public.web_kit_wa_recipient_projects(actor_id,project_slug,chat_id) values(p_actor,p_project,p_chat)
      on conflict do nothing;
  else
    delete from public.web_kit_wa_recipient_projects where actor_id=p_actor and project_slug=p_project and chat_id=p_chat;
  end if;
  return true;
end $$;
revoke all on function public.web_kit_whatsapp_project_recipients(uuid,text) from public, anon, authenticated;
revoke all on function public.web_kit_whatsapp_project_set_recipient(uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function public.web_kit_whatsapp_project_recipients(uuid,text) to service_role;
grant execute on function public.web_kit_whatsapp_project_set_recipient(uuid,text,text,boolean) to service_role;

commit;
