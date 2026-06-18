#!/usr/bin/env sh
set -eu

IMAGE="${1:-${MIMO_IMAGE:-ghcr.io/jinnian0703/mimotts:latest}}"

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR"

MIMO_IMAGE="$IMAGE" docker compose --env-file .env -f docker-compose.yml pull app
MIMO_IMAGE="$IMAGE" docker compose --env-file .env -f docker-compose.yml up -d
