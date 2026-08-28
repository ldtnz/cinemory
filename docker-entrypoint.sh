#!/bin/sh
# Brings the SQLite schema up to date before starting the server. Safe to run
# on every boot: applying migrations that are already applied is a no-op, and
# it means a brand-new volume gets a working database with no manual step.
set -e

echo "Applying database migrations to ${DATABASE_URL}..."
./node_modules/prisma/build/index.js migrate deploy

exec "$@"
