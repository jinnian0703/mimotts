#!/usr/bin/env sh
set -eu

cd /var/www/backend

mkdir -p \
  storage/app/audio \
  storage/app/docker \
  storage/app/private \
  storage/app/public/site-icons \
  storage/framework/cache/data \
  storage/framework/sessions \
  storage/framework/views \
  storage/logs \
  bootstrap/cache

if [ -z "${APP_KEY:-}" ] || printf '%s' "$APP_KEY" | grep -q "replace_with_generated_laravel_app_key"; then
  key_file="${MIMO_DOCKER_APP_KEY_FILE:-storage/app/docker/app-key}"
  mkdir -p "$(dirname "$key_file")"

  if [ ! -s "$key_file" ]; then
    php -r 'echo "base64:".base64_encode(random_bytes(32)).PHP_EOL;' > "$key_file"
  fi

  APP_KEY="$(cat "$key_file")"
  export APP_KEY
  echo "APP_KEY 未配置，已自动生成并保存在 Docker 数据卷。"
fi

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
