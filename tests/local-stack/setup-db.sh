#!/usr/bin/env bash
# Recreate the local test database. Requires a running Postgres with pgvector >= 0.7.
set -euo pipefail
PGHOST=${PGHOST:-/tmp}; PGPORT=${PGPORT:-54329}; DB=${DB:-seminary}
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../.."
psql -h "$PGHOST" -p "$PGPORT" -U postgres -q -c "drop database if exists $DB with (force)" -c "create database $DB"
psql -h "$PGHOST" -p "$PGPORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$ROOT/tests/sql/supabase-stub.sql"
psql -h "$PGHOST" -p "$PGPORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -c "alter table auth.users add column if not exists password_hash text"
psql -h "$PGHOST" -p "$PGPORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/migrations/20260924000000_initial_schema.sql"
psql -h "$PGHOST" -p "$PGPORT" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end $$;
grant anon, authenticated, service_role to authenticator;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant usage on schema public to service_role;
SQL
echo "database $DB ready"
