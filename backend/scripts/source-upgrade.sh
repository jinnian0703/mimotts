#!/usr/bin/env bash
set -euo pipefail

ZIP_URL="${1:-}"
SOURCE_SHA256="${2:-}"
RUN_MIGRATIONS="${3:-0}"

if [ -z "$ZIP_URL" ]; then
  echo "missing source zip url" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET="$(cd "$BACKEND_DIR/.." && pwd)"
SITE_NAME="$(basename "$TARGET")"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${MIMO_BACKUP_DIR:-/root/mimo-backups}"

if ! mkdir -p "$BACKUP_DIR" 2>/dev/null; then
  BACKUP_DIR="$TARGET/backups"
  mkdir -p "$BACKUP_DIR"
fi

ZIP="/tmp/mimotts-source-upgrade-$STAMP.zip"
STAGING="/tmp/mimotts-source-upgrade-$STAMP"
BACKUP="$BACKUP_DIR/$SITE_NAME-$STAMP.tar.gz"

cleanup() {
  rm -rf "$ZIP" "$STAGING"
}
trap cleanup EXIT

curl -fsSL "$ZIP_URL" -o "$ZIP"

if [ -n "$SOURCE_SHA256" ] && [[ "$SOURCE_SHA256" != sha256:* ]]; then
  echo "$SOURCE_SHA256  $ZIP" | sha256sum -c -
elif [ -n "$SOURCE_SHA256" ]; then
  echo "${SOURCE_SHA256#sha256:}  $ZIP" | sha256sum -c -
fi

mkdir -p "$STAGING"
unzip -q "$ZIP" -d "$STAGING"

[ -f "$STAGING/index.html" ]
[ -f "$STAGING/api.php" ]
[ -f "$STAGING/backend/bootstrap/app.php" ]

tar -czf "$BACKUP" -C "$(dirname "$TARGET")" "$(basename "$TARGET")"

rm -rf "$TARGET/_next"
rsync -a \
  --exclude='.user.ini' \
  --exclude='backend/.env' \
  --exclude='backend/storage/app/audio/uploads/***' \
  --exclude='backend/storage/app/audio/generated/***' \
  --exclude='backend/storage/app/public/site-icons/***' \
  --exclude='backend/storage/logs/***' \
  --exclude='backend/storage/framework/cache/data/***' \
  --exclude='backend/storage/framework/sessions/***' \
  --exclude='backend/storage/framework/views/***' \
  "$STAGING"/ "$TARGET"/

chown -R www:www "$TARGET/backend" "$TARGET/_next" 2>/dev/null || true
find "$TARGET/backend/storage" "$TARGET/backend/bootstrap/cache" -type d -exec chmod 775 {} + 2>/dev/null || true
find "$TARGET/backend/storage" "$TARGET/backend/bootstrap/cache" -type f -exec chmod 664 {} + 2>/dev/null || true

php -l "$TARGET/api.php"
php -l "$TARGET/backend/app/Http/Controllers/UpdateController.php"
php -l "$TARGET/backend/app/Services/UpdateService.php"

if [ "$RUN_MIGRATIONS" = "1" ]; then
  (cd "$TARGET/backend" && php artisan migrate --force)
fi

echo "BACKUP=$BACKUP"
echo "DEPLOYED_AT=$(date '+%Y-%m-%d %H:%M:%S')"
