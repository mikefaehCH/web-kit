-- Web-Kit WhatsApp: Versandkontrolle nur noch für den vertrauenswürdigen Backend-Dienst.
--
-- Befund A (Supabase-Linter 0029): web_kit_whatsapp_claim/_finish waren als SECURITY DEFINER
-- für «authenticated» über /rest/v1/rpc aufrufbar. Ein angemeldeter Admin konnte damit
-- – ohne echten Versand – den Audit-Status eines eigenen Auftrags auf «accepted» mit
-- frei erfundener Provider-ID setzen oder Rate-Limit-Plätze verbrauchen.
--
-- Zielbild:
--   * EXECUTE ausschliesslich für service_role (Edge Function), entzogen für PUBLIC/anon/authenticated.
--   * Zusätzlich prüft jede Funktion selbst, dass der Aufruf mit Rolle service_role erfolgt (Defense in Depth).
--   * Das Versandprotokoll ist append-only: Nur die beiden Funktionen schreiben; service_role darf lesen.
--   * Status nur einmal von «pending» in einen Endstatus; neuer Endstatus «unknown» für Timeouts.
--   * Tabelle bleibt RLS-geschützt ohne Policies (Befund B: bewusst, kein direkter Client-Zugriff).
--
-- Reihenfolge beim Ausrollen: zuerst diese Migration, danach Edge Function v3.
-- Dazwischen antwortet v2 fail-closed mit 503 (keine Rechte mehr), es wird nichts versendet.
-- Nicht destruktiv: keine Daten werden gelöscht (Tabelle zum Zeitpunkt der Erstellung leer).

begin;

-- 1. Datenmodell schärfen ----------------------------------------------------
alter table public.web_kit_whatsapp_dispatches
  add column if not exists finished_at timestamptz;

alter table public.web_kit_whatsapp_dispatches
  drop constraint if exists web_kit_whatsapp_dispatches_status_check;
alter table public.web_kit_whatsapp_dispatches
  add constraint web_kit_whatsapp_dispatches_status_check
  check (status in ('pending','accepted','failed','unknown'));

alter table public.web_kit_whatsapp_dispatches
  add constraint web_kit_whatsapp_dispatches_hash_format
  check (message_hash ~ '^[0-9a-f]{64}$');

-- «accepted» genau dann, wenn eine Provider-ID vorliegt.
alter table public.web_kit_whatsapp_dispatches
  add constraint web_kit_whatsapp_dispatches_provider_id
  check ((status = 'accepted') = (provider_message_id is not null)
         and (provider_message_id is null or provider_message_id ~ '^[A-Za-z0-9._:@-]{1,128}$'));

-- Endstatus genau dann, wenn ein Abschlusszeitpunkt gesetzt ist.
alter table public.web_kit_whatsapp_dispatches
  add constraint web_kit_whatsapp_dispatches_finished
  check ((status = 'pending') = (finished_at is null));

-- 2. Unveränderbarkeit: nur pending -> Endstatus, Kernfelder fix ---------------
create or replace function public.web_kit_whatsapp_dispatch_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'web_kit_whatsapp_dispatches is append-only' using errcode = '42501';
  end if;
  if old.status <> 'pending' then
    raise exception 'dispatch already finished' using errcode = '42501';
  end if;
  if new.id <> old.id or new.actor_id <> old.actor_id or new.request_key <> old.request_key
     or new.message_hash <> old.message_hash or new.created_at <> old.created_at then
    raise exception 'dispatch identity is immutable' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.web_kit_whatsapp_dispatch_guard() from public, anon, authenticated, service_role;

drop trigger if exists web_kit_whatsapp_dispatch_guard on public.web_kit_whatsapp_dispatches;
create trigger web_kit_whatsapp_dispatch_guard
  before update or delete on public.web_kit_whatsapp_dispatches
  for each row execute function public.web_kit_whatsapp_dispatch_guard();

-- 3. Tabellenrechte: kein direkter Schreibzugriff, auch nicht für service_role -----
revoke all on public.web_kit_whatsapp_dispatches from public, anon, authenticated, service_role;
grant select on public.web_kit_whatsapp_dispatches to service_role;

-- 4. Funktionen: nur service_role -------------------------------------------
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
  if recent_count >= 10 then
    return false;
  end if;
  insert into public.web_kit_whatsapp_dispatches (actor_id, request_key, message_hash)
  values (p_actor, p_key, p_hash);
  return true;
end $$;

create or replace function public.web_kit_whatsapp_finish(p_actor uuid, p_key uuid, p_status text, p_provider_id text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_actor is null or p_key is null or p_status is null
     or p_status not in ('accepted', 'failed', 'unknown') then
    return false;
  end if;
  if p_status = 'accepted' and (p_provider_id is null or p_provider_id !~ '^[A-Za-z0-9._:@-]{1,128}$') then
    return false;
  end if;
  update public.web_kit_whatsapp_dispatches
     set status = p_status,
         provider_message_id = case when p_status = 'accepted' then p_provider_id else null end,
         finished_at = now()
   where actor_id = p_actor and request_key = p_key and status = 'pending';
  return found;
end $$;

revoke all on function public.web_kit_whatsapp_claim(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.web_kit_whatsapp_finish(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.web_kit_whatsapp_claim(uuid, uuid, text) to service_role;
grant execute on function public.web_kit_whatsapp_finish(uuid, uuid, text, text) to service_role;

comment on table public.web_kit_whatsapp_dispatches is
  'Append-only Versandprotokoll Web-Kit WhatsApp. RLS aktiv ohne Policies = bewusst kein Client-Zugriff. '
  'Schreiben nur über web_kit_whatsapp_claim/_finish (service_role). Speichert keinen Nachrichtentext.';

commit;
