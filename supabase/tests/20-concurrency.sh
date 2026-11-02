#!/usr/bin/env bash
# Parallele Versandversuche: gleiche Request-ID genau einmal, Rate-Limit atomar.
set -euo pipefail
: "${PGDATABASE:?}"
claim() { psql -X -qtA -v ON_ERROR_STOP=1 -c "select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false); set role service_role; select public.web_kit_whatsapp_claim('$1','$2','$(printf 'e%.0s' {1..64})');" | tail -1; }
ADMIN=55555555-5555-4555-8555-555555555555
psql -X -q -v ON_ERROR_STOP=1 -c "insert into auth.users(id,raw_app_meta_data) values ('$ADMIN','{\"web_kit_admin\":true}') on conflict do nothing"
out=$(mktemp -d)
for i in $(seq 1 8); do claim "$ADMIN" ffffffff-0000-4000-8000-000000000001 > "$out/same.$i" & done; wait
same=$(cat "$out"/same.* | grep -c '^t$' || true)
[ "$same" = 1 ] || { echo "FAIL gleiche Request-ID: $same erfolgreiche Claims"; exit 1; }
for i in $(seq 1 20); do claim "$ADMIN" "$(cat /proc/sys/kernel/random/uuid)" > "$out/many.$i" & done; wait
many=$(cat "$out"/many.* | grep -c '^t$' || true)
# 1 Claim aus dem ersten Block + maximal 9 weitere
[ "$many" = 9 ] || { echo "FAIL Rate-Limit parallel: $many statt 9"; exit 1; }
echo "Parallelität ok (8x gleiche ID -> 1, 20 parallel -> Limit 10 eingehalten)"
