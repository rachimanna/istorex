#!/bin/sh
set -e
# Apply pending database migrations before the server starts (safe to run on every start).
if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
  node_modules/.bin/prisma migrate deploy
  # Idempotent bootstrap — lets hosts without a shell (e.g. Render free tier) initialise themselves.
  node scripts/seed.mjs || echo "seed skipped"
  node scripts/create-buckets.mjs || echo "bucket check skipped (create buckets in the storage dashboard)"
  if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
    node scripts/create-admin.mjs --if-missing || echo "admin bootstrap failed"
  fi
fi
exec "$@"
