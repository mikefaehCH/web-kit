-- Bereits produktiv angewendet (Projekt qoensghjemruqafrbmjd, Version 20261102053911).
-- Hier unverändert versioniert. Befund A (Supabase-Linter 0029): durch authenticated aufrufbar.
-- Gehärtet durch 20261102090000_web_kit_whatsapp_service_role_only.sql.
create or replace function public.web_kit_whatsapp_finish(p_actor uuid,p_key uuid,p_status text,p_provider_id text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is distinct from p_actor then return false; end if;
 if p_status not in ('accepted','failed') then return false; end if;
 update public.web_kit_whatsapp_dispatches set status=p_status,provider_message_id=case when p_status='accepted' then p_provider_id else null end
 where actor_id=p_actor and request_key=p_key and status='pending';
 return found;
end $$;
revoke all on function public.web_kit_whatsapp_finish(uuid,uuid,text,text) from public,anon;
grant execute on function public.web_kit_whatsapp_finish(uuid,uuid,text,text) to authenticated;
