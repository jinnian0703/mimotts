#!/usr/bin/env sh
set -eu

cd /var/www/backend

if [ -z "${APP_KEY:-}" ] || printf '%s' "$APP_KEY" | grep -q "replace_with_generated_laravel_app_key"; then
  echo "APP_KEY 未配置，请先在 deploy/docker/.env 中填写 APP_KEY" >&2
  exit 1
fi

mkdir -p \
  storage/app/audio \
  storage/app/private \
  storage/framework/cache/data \
  storage/framework/sessions \
  storage/framework/views \
  storage/logs \
  bootstrap/cache

if [ "${DB_CONNECTION:-sqlite}" = "sqlite" ]; then
  db_path="${DB_DATABASE:-/var/www/backend/storage/database.sqlite}"
  mkdir -p "$(dirname "$db_path")"
  [ -f "$db_path" ] || touch "$db_path"
fi

chown -R www-data:www-data storage bootstrap/cache

rm -f bootstrap/cache/*.php

php artisan storage:link >/dev/null 2>&1 || true
php artisan package:discover --ansi

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  php artisan migrate --force
fi

php artisan optimize:clear || true
php artisan config:cache || true
php artisan route:cache || true
php artisan view:cache || true

exec "$@"
