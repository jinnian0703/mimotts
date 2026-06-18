FROM node:22-alpine AS frontend

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/next.config.* ./
COPY frontend/tsconfig.json ./
COPY frontend/postcss.config.* ./
COPY frontend/eslint.config.* ./
COPY frontend/components.json ./
COPY frontend/src ./src
COPY frontend/public ./public

ARG NEXT_PUBLIC_API_BASE_URL=/api
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM php:7.4-cli-alpine AS vendor

WORKDIR /app

ENV COMPOSER_ALLOW_SUPERUSER=1

RUN apk add --no-cache \
      git \
      icu-dev \
      libzip-dev \
      oniguruma-dev \
      sqlite-dev \
      unzip \
    && docker-php-ext-install -j"$(nproc)" \
      bcmath \
      intl \
      mbstring \
      pcntl \
      pdo_mysql \
      pdo_sqlite \
      zip

COPY --from=composer:2.2 /usr/bin/composer /usr/local/bin/composer
COPY backend/ ./

RUN composer install --no-dev --prefer-dist --no-interaction --no-progress --optimize-autoloader --no-scripts

FROM php:7.4-apache

WORKDIR /var/www/backend

ARG APP_VERSION=dev
ARG APP_BUILD_COMMIT=
ARG APP_BUILD_TIME=
ENV APP_VERSION=$APP_VERSION
ENV APP_BUILD_COMMIT=$APP_BUILD_COMMIT
ENV APP_BUILD_TIME=$APP_BUILD_TIME
ENV MIMO_DEPLOYMENT_MODE=docker

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      libicu-dev \
      libonig-dev \
      libsqlite3-dev \
      libzip-dev \
      unzip \
    && docker-php-ext-install -j"$(nproc)" \
      bcmath \
      intl \
      mbstring \
      pdo_mysql \
      pdo_sqlite \
      zip \
    && a2enmod rewrite headers \
    && rm -rf /var/lib/apt/lists/*

COPY backend/ ./
COPY --from=vendor /app/vendor ./vendor
COPY --from=frontend /app/out ./public
COPY backend/public/index.php ./public/index.php
COPY deploy/docker/apache-vhost.conf /etc/apache2/sites-available/000-default.conf
COPY deploy/docker/app-entrypoint.sh /usr/local/bin/mimo-app
COPY deploy/docker/php.ini /usr/local/etc/php/conf.d/mimo.ini

RUN chmod +x /usr/local/bin/mimo-app \
    && if [ -f scripts/source-upgrade.sh ]; then chmod +x scripts/source-upgrade.sh; fi \
    && php -r 'file_put_contents("build.json", json_encode(["version" => getenv("APP_VERSION") ?: "dev", "commit" => getenv("APP_BUILD_COMMIT") ?: null, "built_at" => getenv("APP_BUILD_TIME") ?: null], JSON_UNESCAPED_SLASHES));' \
    && mkdir -p storage/app/audio storage/app/public/site-icons storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 80

ENTRYPOINT ["mimo-app"]
CMD ["apache2-foreground"]
