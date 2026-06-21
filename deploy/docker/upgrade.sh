#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE=".env"
DEFAULT_IMAGE="ghcr.io/jinnian0703/mimotts:latest"

if [ ! -f "$ENV_FILE" ]; then
  echo "missing $SCRIPT_DIR/$ENV_FILE; copy .env.example to .env before upgrading" >&2
  exit 1
fi

FILE_IMAGE="$(awk -F= '$1 == "MIMO_IMAGE" { value = substr($0, index($0, "=") + 1) } END { print value }' "$ENV_FILE")"
IMAGE="${1:-${MIMO_IMAGE:-${FILE_IMAGE:-$DEFAULT_IMAGE}}}"
TMP_ENV="$ENV_FILE.tmp.$$"

cleanup() {
  rm -f "$TMP_ENV"
}
trap cleanup EXIT HUP INT TERM

if [ -e "$TMP_ENV" ]; then
  echo "temporary env file already exists: $TMP_ENV" >&2
  exit 1
fi

cp -p "$ENV_FILE" "$TMP_ENV"
awk -v image="$IMAGE" '
  BEGIN { written = 0 }
  /^MIMO_IMAGE=/ {
    print "MIMO_IMAGE=" image
    written = 1
    next
  }
  { print }
  END {
    if (! written) {
      print "MIMO_IMAGE=" image
    }
  }
' "$ENV_FILE" > "$TMP_ENV"
mv "$TMP_ENV" "$ENV_FILE"
trap - EXIT HUP INT TERM

MIMO_IMAGE="$IMAGE" docker compose --env-file .env -f docker-compose.yml pull app
MIMO_IMAGE="$IMAGE" docker compose --env-file .env -f docker-compose.yml up -d
