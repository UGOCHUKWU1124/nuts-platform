#!/bin/sh
# ==============================================================================
# Docker Entrypoint — NUTS Commerce API
# ==============================================================================
# Runs Prisma migrations against the database before starting the server.
# Retries on failure with exponential backoff to handle transient DB issues.
# ==============================================================================
set -eu

echo "[entrypoint] Starting NestJS API (migrations are managed by api-migrate)..."
exec node dist/main
