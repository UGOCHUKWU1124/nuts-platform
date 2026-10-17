#!/bin/sh
# ==============================================================================
# Docker Entrypoint — NUTS Commerce API
# ==============================================================================
# Runs Prisma migrations against the database before starting the server.
# Retries on failure with exponential backoff to handle transient DB issues.
# ==============================================================================
set -eu

# If AUTO_MIGRATE is not explicitly set to false and DATABASE_URL is provided,
# execute database migrations before booting the NestJS application.
if [ "${AUTO_MIGRATE:-true}" != "false" ] && [ -n "${DATABASE_URL:-}" ]; then
  if [ -x "./docker-migrate.sh" ]; then
    echo "[entrypoint] Executing automated database migrations..."
    ./docker-migrate.sh
  elif [ -x "/app/apps/api/docker-migrate.sh" ]; then
    echo "[entrypoint] Executing automated database migrations..."
    /app/apps/api/docker-migrate.sh
  fi
fi

echo "[entrypoint] Starting NestJS API..."
export TS_NODE_PROJECT=./tsconfig.runtime.json
exec node -r tsconfig-paths/register dist/main
