#!/usr/bin/env bash
# Datenbanktests gegen ein leeres Postgres: Stub, alle Migrationen in Reihenfolge, Tests.
# Aufruf: PGHOST=… PGUSER=postgres PGDATABASE=webkit_test supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")"
psql -X -q -v ON_ERROR_STOP=1 -f 00-supabase-stub.sql
for m in ../migrations/*.sql; do psql -X -q -v ON_ERROR_STOP=1 -f "$m"; done
psql -X -q -v ON_ERROR_STOP=1 -f 10-whatsapp-dispatch.test.sql 2>&1 | sed 's/^psql:[^ ]* //'
./20-concurrency.sh
echo "Alle Datenbanktests bestanden"
