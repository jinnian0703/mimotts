COMPOSE=docker compose --env-file deploy/docker/.env -f deploy/docker/docker-compose.yml

.PHONY: help up down restart build logs ps migrate key shell backup source

help:
	@echo "Mimo deployment commands"
	@echo "  make up        Build and start the Docker app container"
	@echo "  make down      Stop the Docker app container"
	@echo "  make restart   Restart the Docker app container"
	@echo "  make logs      Follow app logs"
	@echo "  make ps        Show app status"
	@echo "  make key       Generate Laravel APP_KEY"
	@echo "  make migrate   Run database migrations"
	@echo "  make backup    Back up Docker SQLite/storage volume"
	@echo "  make source    Build BaoTa source-upload package"

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

restart:
	$(COMPOSE) restart

build:
	$(COMPOSE) build

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

migrate:
	$(COMPOSE) exec app php artisan migrate --force

key:
	docker run --rm php:7.4-cli-alpine php -r 'echo "base64:".base64_encode(random_bytes(32)).PHP_EOL;'

shell:
	$(COMPOSE) exec app sh

backup:
	mkdir -p dist
	docker run --rm -v mimo_app_storage:/data -v "$(PWD)/dist:/backup" alpine tar czf /backup/mimo-app-storage.tgz -C /data .

source:
	powershell -ExecutionPolicy Bypass -File scripts/build-source-upload.ps1
