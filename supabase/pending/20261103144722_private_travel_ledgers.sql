-- Additive private ledgers; existing Camino tables and entries are untouched.
create table public.web_kit_private_trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  title text not null check (length(trim(title)) between 1 and 120),
  people text[] not null check (cardinality(people) between 1 and 50),
  created_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  unique (id, owner_id)
);
create table public.web_kit_private_entries (
  trip_id uuid not null,
  owner_id uuid not null default auth.uid() references auth.users(id),
  entry_id text not null check (length(entry_id) between 1 and 120),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 4096 and (payload->>'id') is not distinct from entry_id),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  primary key (trip_id, entry_id),
  foreign key (trip_id, owner_id) references public.web_kit_private_trips(id, owner_id) on delete cascade
);
alter table public.web_kit_private_trips enable row level security;
alter table public.web_kit_private_entries enable row level security;
revoke all on public.web_kit_private_trips, public.web_kit_private_entries from public, anon, authenticated;
grant select, insert, update, delete on public.web_kit_private_trips, public.web_kit_private_entries to authenticated;
create policy private_trips_owner on public.web_kit_private_trips for all to authenticated
  using ((select auth.uid()) = owner_id and owner_id = '829dfa95-6722-4b08-aa1b-843e38a06ba7'::uuid)
  with check ((select auth.uid()) = owner_id and owner_id = '829dfa95-6722-4b08-aa1b-843e38a06ba7'::uuid);
create policy private_entries_owner on public.web_kit_private_entries for all to authenticated
  using ((select auth.uid()) = owner_id and owner_id = '829dfa95-6722-4b08-aa1b-843e38a06ba7'::uuid)
  with check ((select auth.uid()) = owner_id and owner_id = '829dfa95-6722-4b08-aa1b-843e38a06ba7'::uuid);

-- Server-issued version prevents cooperating clients from silently overwriting newer edits.
create function public.web_kit_private_entry_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;
revoke all on function public.web_kit_private_entry_revision() from public, anon, authenticated;
create trigger web_kit_private_entry_revision before update on public.web_kit_private_entries
for each row execute function public.web_kit_private_entry_revision();

-- Participant removal would invalidate existing entries; retain prior names.
create function public.web_kit_private_trip_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not old.people <@ new.people then
    raise exception 'Removing participants is not supported';
  end if;
  new.version := old.version + 1;
  return new;
end;
$$;
revoke all on function public.web_kit_private_trip_revision() from public, anon, authenticated;
create trigger web_kit_private_trip_revision before update on public.web_kit_private_trips
for each row execute function public.web_kit_private_trip_revision();

-- One invoker-security statement reads the trip and all of its entries in one MVCC snapshot.
create function public.web_kit_private_ledger_snapshot(p_trip_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'trip', pg_catalog.jsonb_build_object('id', t.id, 'title', t.title, 'people', t.people, 'created_at', t.created_at, 'version', t.version),
    'entries', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('entry_id', e.entry_id, 'payload', e.payload, 'updated_at', e.updated_at, 'version', e.version) order by e.entry_id)
      from public.web_kit_private_entries e where e.trip_id = t.id and e.owner_id = t.owner_id), '[]'::jsonb))
  from public.web_kit_private_trips t where t.id = p_trip_id and t.owner_id = (select auth.uid());
$$;
revoke all on function public.web_kit_private_ledger_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.web_kit_private_ledger_snapshot(uuid) to authenticated;
