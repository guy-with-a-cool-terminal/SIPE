#!/usr/bin/env bash
# Access-rule tests for Projects: runs every migration on a throwaway database
# (with a small stub of Supabase's auth/storage schemas), then acts as owner,
# co-founder, contributor, viewer and an outsider, and compares the result with
# projects_access.expected. Any difference means an access rule changed.
#
#   PGURL=postgres://postgres@127.0.0.1:55432 supabase/tests/run-projects-access.sh
#
# Needs a Postgres 15+ server you can create databases on (never production).
set -euo pipefail
cd "$(dirname "$0")"
PGURL="${PGURL:-postgres://postgres@127.0.0.1:55432}"
DB="sipe_access_test_$$"
psql "$PGURL/postgres" -qc "create database $DB" >/dev/null
trap 'psql "$PGURL/postgres" -qc "drop database if exists $DB" >/dev/null' EXIT
psql "$PGURL/$DB" -q -v ON_ERROR_STOP=1 -f supabase_stub.sql >/dev/null
for f in ../migrations/*.sql; do
  psql "$PGURL/$DB" -q -v ON_ERROR_STOP=1 -c "set search_path=public,extensions" -f "$f" >/dev/null 2>&1 \
    || { echo "migration failed: $f"; exit 1; }
done
psql "$PGURL/$DB" -f - < projects_access.sql 2>&1 \
  | grep -v "^SET\|^RESET\|^$\|as_user\|^-----\|^(1 row)\|^ *$" > /tmp/projects_access.out
if diff -u projects_access.expected /tmp/projects_access.out; then
  echo "projects access: all checks match"
else
  echo "projects access: output changed (see diff above)"; exit 1
fi
