#!/usr/bin/env bash
set -euo pipefail

ZIP_URL="${1:-}"
SOURCE_SHA256="${2:-}"
RUN_MIGRATIONS="${3:-0}"

if [ -z "$ZIP_URL" ]; then
  echo "missing source zip url" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd -P)"
TARGET="$(cd "$BACKEND_DIR/.." && pwd -P)"
SITE_NAME="$(basename "$TARGET")"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${MIMO_BACKUP_DIR:-/root/mimo-backups}"

require_source_target() {
  if [ "$TARGET" = "/" ]; then
    echo "refusing to upgrade filesystem root" >&2
    exit 1
  fi

  if [ ! -d "$TARGET/backend" ] || [ ! -f "$TARGET/api.php" ] || [ ! -f "$TARGET/backend/scripts/source-upgrade.sh" ]; then
    echo "refusing to upgrade target that does not look like a Mimo source install: $TARGET" >&2
    exit 1
  fi
}

require_source_target

if ! mkdir -p "$BACKUP_DIR" 2>/dev/null; then
  BACKUP_DIR="$TARGET/backups"
  mkdir -p "$BACKUP_DIR"
fi

BACKUP_DIR="$(cd "$BACKUP_DIR" && pwd -P)"
if [ "$BACKUP_DIR" = "$TARGET" ]; then
  echo "backup directory must not be the site root: $BACKUP_DIR" >&2
  exit 1
fi

BACKUP_RELATIVE=""
if [[ "$BACKUP_DIR" == "$TARGET/"* ]]; then
  BACKUP_RELATIVE="${BACKUP_DIR:${#TARGET}+1}"
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
[ -d "$STAGING/_next" ]
[ -f "$STAGING/backend/bootstrap/app.php" ]

if [ -n "$BACKUP_RELATIVE" ]; then
  tar --exclude="$(basename "$TARGET")/$BACKUP_RELATIVE" -czf "$BACKUP" -C "$(dirname "$TARGET")" "$(basename "$TARGET")"
else
  tar -czf "$BACKUP" -C "$(dirname "$TARGET")" "$(basename "$TARGET")"
fi

RSYNC_FILTERS=(
  --filter='H /.user.ini'
  --filter='P /.user.ini'
  --filter='H /.env'
  --filter='P /.env'
  --filter='H /backend/.env'
  --filter='P /backend/.env'
  --filter='H /backend/storage/***'
  --filter='P /backend/storage/***'
  --filter='P /backend/bootstrap/cache/***'
)

if [ -n "$BACKUP_RELATIVE" ]; then
  RSYNC_FILTERS+=(
    --filter="H /$BACKUP_RELATIVE/***"
    --filter="P /$BACKUP_RELATIVE/***"
  )
fi

# H hides sender-side files; P protects receiver-side files from --delete.
# backend/storage covers uploads, generated audio, site icons, logs, sessions,
# views, and Laravel file cache. backend/bootstrap/cache is protected from
# wholesale deletion while packaged Composer cache metadata can still refresh.
rsync -a \
  --delete \
  --delete-delay \
  --delay-updates \
  "${RSYNC_FILTERS[@]}" \
  "$STAGING"/ "$TARGET"/

mkdir -p \
  "$TARGET/backend/storage/app/audio/uploads" \
  "$TARGET/backend/storage/app/audio/generated" \
  "$TARGET/backend/storage/app/private" \
  "$TARGET/backend/storage/app/public/site-icons" \
  "$TARGET/backend/storage/framework/cache/data" \
  "$TARGET/backend/storage/framework/sessions" \
  "$TARGET/backend/storage/framework/views" \
  "$TARGET/backend/storage/logs" \
  "$TARGET/backend/bootstrap/cache"

find "$TARGET/backend/bootstrap/cache" -maxdepth 1 -type f \
  \( -name 'config.php' -o -name 'routes*.php' -o -name 'events.php' -o -name 'compiled.php' \) \
  -exec rm -f {} + 2>/dev/null || true

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
