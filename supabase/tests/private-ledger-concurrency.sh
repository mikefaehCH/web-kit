#!/usr/bin/env bash
# Only runs against the isolated synthetic PostgreSQL service in CI.
set -euo pipefail
[ "${PGDATABASE:-}" = ledger_test ] && [ "${PGHOST:-}" = localhost ] || { echo 'Refusing non-test database'; exit 1; }
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
set role authenticated;
insert into public.web_kit_private_trips(id,title,people) values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','0',array['A']);
insert into public.web_kit_private_entries(trip_id,entry_id,payload) values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','e','{"id":"e","value":"0"}');
SQL
(
  for i in $(seq 1 40); do
    psql -X -q -v ON_ERROR_STOP=1 >/dev/null <<SQL
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
set role authenticated;
begin;
update public.web_kit_private_trips set title='$i' where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
select pg_sleep(0.01);
update public.web_kit_private_entries set payload=jsonb_build_object('id','e','value','$i') where trip_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' and entry_id='e';
commit;
SQL
  done
) &
writer=$!
trap 'kill "$writer" 2>/dev/null || true' EXIT
for i in $(seq 1 60); do
  result=$(psql -X -qAt -v ON_ERROR_STOP=1 <<'SQL' | tail -n 1
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
set role authenticated;
select (s->'trip'->>'title') = (s->'entries'->0->'payload'->>'value') from (select public.web_kit_private_ledger_snapshot('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') s) q;
SQL
)
  [ "$result" = t ] || { echo 'FAIL inconsistent concurrent snapshot'; exit 1; }
done
wait "$writer"
trap - EXIT
echo 'PASS: concurrent committed trip/entry changes yield consistent snapshots'
