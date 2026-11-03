-- Additive preparation for an isolated Supabase project. No seed or production data.
begin;

create schema travel_private;
revoke all on schema travel_private from public, anon, authenticated;

create table public.travel_projects (
  id uuid primary key,
  trip_id text not null check (trip_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  start_day date not null,
  end_day date not null,
  check (start_day between date '0001-01-01' and date '9999-12-31'),
  check (end_day between start_day and start_day + 366)
);
create table public.travel_project_members (
  project_id uuid not null references public.travel_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer', 'editor')),
  primary key (project_id, user_id)
);
create index travel_project_members_user_idx on public.travel_project_members(user_id, project_id);
create table public.travel_project_places (
  project_id uuid not null references public.travel_projects(id) on delete cascade,
  place_id text not null check (place_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  primary key (project_id, place_id)
);
create table public.travel_project_plans (
  project_id uuid primary key references public.travel_projects(id) on delete cascade,
  revision bigint not null check (revision >= 1 and revision < 9007199254740991),
  payload jsonb not null check (octet_length(payload::text) <= 1000000)
);

alter table public.travel_projects enable row level security;
alter table public.travel_project_members enable row level security;
alter table public.travel_project_places enable row level security;
alter table public.travel_project_plans enable row level security;

-- Explicit grants override potentially broad Supabase default privileges.
revoke all on public.travel_projects, public.travel_project_members,
  public.travel_project_places, public.travel_project_plans from public, anon, authenticated;
grant select on public.travel_projects, public.travel_project_members,
  public.travel_project_places, public.travel_project_plans to authenticated;
grant insert (project_id, revision, payload), update (revision, payload)
  on public.travel_project_plans to authenticated;

create policy travel_members_self on public.travel_project_members
for select to authenticated using (
  user_id = (select auth.uid())
  and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean, false)
);
create policy travel_projects_member on public.travel_projects
for select to authenticated using (exists (
  select 1 from public.travel_project_members m
  where m.project_id = id and m.user_id = (select auth.uid())
));
create policy travel_places_member on public.travel_project_places
for select to authenticated using (exists (
  select 1 from public.travel_project_members m
  where m.project_id = travel_project_places.project_id and m.user_id = (select auth.uid())
));
create policy travel_plans_read on public.travel_project_plans
for select to authenticated using (exists (
  select 1 from public.travel_project_members m
  where m.project_id = travel_project_plans.project_id and m.user_id = (select auth.uid())
));
create policy travel_plans_insert on public.travel_project_plans
for insert to authenticated with check (exists (
  select 1 from public.travel_project_members m
  where m.project_id = travel_project_plans.project_id
    and m.user_id = (select auth.uid()) and m.role = 'editor'
));
create policy travel_plans_update on public.travel_project_plans
for update to authenticated using (exists (
  select 1 from public.travel_project_members m
  where m.project_id = travel_project_plans.project_id
    and m.user_id = (select auth.uid()) and m.role = 'editor'
)) with check (exists (
  select 1 from public.travel_project_members m
  where m.project_id = travel_project_plans.project_id
    and m.user_id = (select auth.uid()) and m.role = 'editor'
));

create function travel_private.validate_project_plan()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  project public.travel_projects%rowtype;
  entry jsonb;
  day_text text;
  entry_day date;
  seen text[] := array[]::text[];
  identity_key text;
begin
  if tg_op = 'UPDATE' then
    if new.project_id is distinct from old.project_id then
      raise exception 'Project ID is immutable' using errcode = '23514';
    end if;
    if new.revision is distinct from old.revision + 1 then
      raise exception 'Revision must increase by exactly one' using errcode = '23514';
    end if;
  elsif new.revision is distinct from 1::bigint then
    raise exception 'Initial revision must be one' using errcode = '23514';
  end if;
  select * into project from public.travel_projects where id = new.project_id;
  if not found then
    raise exception 'Project not accessible' using errcode = '42501';
  end if;
  if jsonb_typeof(new.payload) is distinct from 'object' then
    raise exception 'Invalid payload' using errcode = '23514';
  end if;
  if (select count(*) from jsonb_object_keys(new.payload)) <> 3
    or new.payload->'version' is distinct from '1'::jsonb
    or new.payload->'tripId' is distinct from to_jsonb(project.trip_id)
    or jsonb_typeof(new.payload->'plan') is distinct from 'array' then
    raise exception 'Invalid payload contract' using errcode = '23514';
  end if;
  if jsonb_array_length(new.payload->'plan') > 5000 then
    raise exception 'Plan too large' using errcode = '23514';
  end if;
  for entry in select value from jsonb_array_elements(new.payload->'plan') loop
    if jsonb_typeof(entry) is distinct from 'object' then
      raise exception 'Invalid plan entry' using errcode = '23514';
    end if;
    if (select count(*) from jsonb_object_keys(entry)) <> 2
      or jsonb_typeof(entry->'placeId') is distinct from 'string'
      or jsonb_typeof(entry->'day') is distinct from 'string' then
      raise exception 'Invalid plan fields' using errcode = '23514';
    end if;
    day_text := entry->>'day';
    if day_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Invalid day format' using errcode = '23514';
    end if;
    entry_day := day_text::date;
    if entry_day not between project.start_day and project.end_day
      or not exists (select 1 from public.travel_project_places p
        where p.project_id = new.project_id and p.place_id = entry->>'placeId') then
      raise exception 'Day or place outside project' using errcode = '23514';
    end if;
    identity_key := (entry->>'placeId') || '/' || day_text;
    if identity_key = any(seen) then
      raise exception 'Duplicate plan entry' using errcode = '23514';
    end if;
    seen := array_append(seen, identity_key);
  end loop;
  return new;
end;
$$;
revoke all on function travel_private.validate_project_plan() from public, anon, authenticated;
create trigger travel_plan_validate before insert or update on public.travel_project_plans
for each row execute function travel_private.validate_project_plan();

commit;
