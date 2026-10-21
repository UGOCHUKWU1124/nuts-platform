#!/bin/sh
# Run database migrations once as a release job before any API replica starts.
set -eu

SCHEMA_PATH="/app/packages/database/schema.prisma"
if [ ! -s "$SCHEMA_PATH" ] && [ -s "../../packages/database/schema.prisma" ]; then
  SCHEMA_PATH="../../packages/database/schema.prisma"
elif [ ! -s "$SCHEMA_PATH" ] && [ -s "packages/database/schema.prisma" ]; then
  SCHEMA_PATH="packages/database/schema.prisma"
fi

PRISMA_CONFIG="/app/apps/api/prisma.config.ts"
if [ ! -s "$PRISMA_CONFIG" ] && [ -s "./prisma.config.ts" ]; then
  PRISMA_CONFIG="./prisma.config.ts"
fi

PRISMA_BIN=""
if [ -x "/app/apps/api/node_modules/.bin/prisma" ]; then
  PRISMA_BIN="/app/apps/api/node_modules/.bin/prisma"
elif [ -x "./node_modules/.bin/prisma" ]; then
  PRISMA_BIN="./node_modules/.bin/prisma"
elif [ -x "/app/node_modules/.bin/prisma" ]; then
  PRISMA_BIN="/app/node_modules/.bin/prisma"
elif [ -x "/app/packages/database/node_modules/.bin/prisma" ]; then
  PRISMA_BIN="/app/packages/database/node_modules/.bin/prisma"
elif command -v npx >/dev/null 2>&1; then
  PRISMA_BIN="npx prisma"
fi

MAX_RETRIES="${MIGRATION_MAX_RETRIES:-5}"
RETRY_DELAY="${MIGRATION_RETRY_DELAY_SECONDS:-3}"
MAX_RETRY_DELAY=30

if [ ! -s "$SCHEMA_PATH" ]; then
  echo "[migrate] ERROR: Prisma schema is missing: $SCHEMA_PATH" >&2
  exit 1
fi

if [ ! -s "$PRISMA_CONFIG" ]; then
  echo "[migrate] ERROR: Prisma configuration is missing: $PRISMA_CONFIG" >&2
  exit 1
fi

if [ -z "$PRISMA_BIN" ]; then
  echo "[migrate] ERROR: Prisma CLI is missing across workspace node_modules" >&2
  exit 1
fi

case "$MAX_RETRIES" in
  ''|*[!0-9]*) echo "[migrate] ERROR: MIGRATION_MAX_RETRIES must be a positive integer" >&2; exit 1 ;;
esac
if [ "$MAX_RETRIES" -lt 1 ]; then
  echo "[migrate] ERROR: MIGRATION_MAX_RETRIES must be at least 1" >&2
  exit 1
fi

attempt=1
while [ "$attempt" -le "$MAX_RETRIES" ]; do
  echo "[migrate] Applying Prisma migrations using $PRISMA_BIN (attempt $attempt/$MAX_RETRIES)..."
  if eval "$PRISMA_BIN migrate deploy --schema=\"$SCHEMA_PATH\""; then
    echo "[migrate] Migrations completed successfully."
    exit 0
  fi

  if [ "$attempt" -eq "$MAX_RETRIES" ]; then
    echo "[migrate] ERROR: Migration failed after $MAX_RETRIES attempts; blocking API startup." >&2
    exit 1
  fi

  echo "[migrate] Migration attempt failed; retrying in ${RETRY_DELAY}s."
  sleep "$RETRY_DELAY"
  RETRY_DELAY=$((RETRY_DELAY * 2))
  if [ "$RETRY_DELAY" -gt "$MAX_RETRY_DELAY" ]; then
    RETRY_DELAY="$MAX_RETRY_DELAY"
  fi
  attempt=$((attempt + 1))
done

echo "[migrate] ERROR: Migration loop ended unexpectedly." >&2
exit 1
