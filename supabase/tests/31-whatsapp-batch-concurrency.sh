#!/usr/bin/env bash
set -euo pipefail
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
insert into public.web_kit_wa_batches(id,actor_id,message_hash) values ('aaaaaaaa-2222-4222-8222-222222222223','aaaaaaaa-1111-4111-8111-111111111111',repeat('b',64));
insert into public.web_kit_wa_batch_items(id,batch_id,request_key,position,chat_id) values
 ('aaaaaaaa-3333-4333-8333-333333333333','aaaaaaaa-2222-4222-8222-222222222223','aaaaaaaa-4444-4444-8444-444444444443',1,'41790000002@c.us'),
 ('aaaaaaaa-3333-4333-8333-333333333334','aaaaaaaa-2222-4222-8222-222222222223','aaaaaaaa-4444-4444-8444-444444444444',2,'41790000003@c.us');
SQL
pids=()
for n in 1 2; do
  psql -X -qAt -v ON_ERROR_STOP=1 >"$tmp/$n" <<'SQL' &
select set_config('request.jwt.claim.role','service_role',false);
set role service_role;
begin;
select public.web_kit_whatsapp_batch_claim('aaaaaaaa-2222-4222-8222-222222222223','aaaaaaaa-1111-4111-8111-111111111111',repeat('b',64))->>'state';
select pg_sleep(1);
commit;
SQL
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
test "$(cat "$tmp/1" "$tmp/2" | grep -c '^claimed$')" = 1
test "$(cat "$tmp/1" "$tmp/2" | grep -c '^blocked$')" = 1

# Concurrent creation must not exceed the hourly limit for a fresh actor.
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users(id,raw_app_meta_data) values ('cccccccc-1111-4111-8111-111111111111','{"web_kit_admin":true}');
SQL
pids=()
for n in $(seq 1 12); do
  psql -X -qAt -v ON_ERROR_STOP=1 >"$tmp/create-$n" <<'SQL' &
select set_config('request.jwt.claim.role','service_role',false);
set role service_role;
select public.web_kit_whatsapp_batch_create(gen_random_uuid(),'cccccccc-1111-4111-8111-111111111111',repeat('c',64),'["41790000000@c.us"]'::jsonb);
SQL
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
test "$(cat "$tmp"/create-* | grep -c '^t$')" = 10
test "$(cat "$tmp"/create-* | grep -c '^f$')" = 2

# Legacy and batch contend for the final remaining send slot.
psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.users(id,raw_app_meta_data) values ('ffffffff-1111-4111-8111-111111111111','{"web_kit_admin":true}');
select set_config('request.jwt.claim.role','service_role',false);
set role service_role;
select public.web_kit_whatsapp_batch_create('ffffffff-2222-4222-8222-222222222222','ffffffff-1111-4111-8111-111111111111',repeat('a',64),'["41790000008@c.us"]');
do $$ begin for n in 1..9 loop assert public.web_kit_whatsapp_claim('ffffffff-1111-4111-8111-111111111111',gen_random_uuid(),repeat('f',64)); end loop; end $$;
SQL
psql -X -qAt -v ON_ERROR_STOP=1 >"$tmp/legacy" <<'SQL' &
select set_config('request.jwt.claim.role','service_role',false);
set role service_role;
select public.web_kit_whatsapp_claim('ffffffff-1111-4111-8111-111111111111',gen_random_uuid(),repeat('f',64));
SQL
p1=$!
psql -X -qAt -v ON_ERROR_STOP=1 >"$tmp/batch" <<'SQL' &
select set_config('request.jwt.claim.role','service_role',false);
set role service_role;
select public.web_kit_whatsapp_batch_claim('ffffffff-2222-4222-8222-222222222222','ffffffff-1111-4111-8111-111111111111',repeat('a',64))->>'state';
SQL
p2=$!
wait "$p1"
wait "$p2"
if grep -qx 't' "$tmp/legacy"; then grep -qx 'rate_limited' "$tmp/batch"; else grep -qx 'f' "$tmp/legacy" && grep -qx 'claimed' "$tmp/batch"; fi
