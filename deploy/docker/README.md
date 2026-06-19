# Docker 标准部署

本目录是 Docker 标准部署入口，适合独立自托管或测试环境。

默认只有一个应用容器：

```text
mimo-app
```

应用容器同时提供前端静态页面和 Laravel API。数据库默认使用 SQLite 文件，保存在 Docker volume 中，不需要单独的 MySQL 或 MariaDB 容器。

## 结构

```text
浏览器
  -> http://服务器地址:18081
  -> mimo-app
     - /      前端页面
     - /api   Laravel API
```

默认数据卷：

```text
mimo_app_storage
```

其中包含 SQLite 数据库、上传音频、生成音频、缓存和日志。

## 快速开始

```bash
git clone https://github.com/jinnian0703/mimotts.git
cd mimotts/deploy/docker
cp .env.example .env
docker compose up -d
```

访问：

```text
http://服务器地址:18081
```

首次启动会自动完成安装。查看管理员账号：

```bash
docker compose logs app | grep "管理员"
```

## 配置

仓库只提供示例文件，真实配置写在 `.env`：

```bash
cp .env.example .env
```

按实际域名或服务器地址编辑 `.env` 中这些值：

```env
WEB_PORT=18081

APP_URL=http://服务器地址:18081
FRONTEND_URL=http://服务器地址:18081
PUBLIC_API_BASE_URL=/api
SANCTUM_STATEFUL_DOMAINS=服务器地址:18081
CORS_ALLOWED_ORIGINS=http://服务器地址:18081
LINUXDO_REDIRECT_URI=http://服务器地址:18081/api/auth/linuxdo/callback
```

首次管理员账号可在 `.env` 中指定：

```env
MIMO_ADMIN_EMAIL=admin@example.com
MIMO_ADMIN_PASSWORD=
```

`MIMO_ADMIN_PASSWORD` 留空时，容器会生成随机密码，并写入 `docker compose logs app`。系统已安装后重启不会重新生成或覆盖管理员。

数据库默认保持 SQLite：

```env
DB_CONNECTION=sqlite
DB_DATABASE=/var/www/backend/storage/database.sqlite
```

真实 `.env` 不要提交到 Git；仓库只保留 `.env.example`。

如果只想下载 Docker 部署文件，可以使用 Git sparse checkout：

```bash
git clone --filter=blob:none --sparse https://github.com/jinnian0703/mimotts.git
cd mimotts
git sparse-checkout set deploy/docker
cd deploy/docker
```

Docker 部署不需要进入安装页。容器会自动创建 SQLite 数据库、执行迁移、创建管理员，并把 `.env` 里的 Mimo API、LinuxDo、邮箱登录开关同步到系统配置。`.env` 保持示例 `APP_KEY` 时，容器会自动生成并保存到 Docker 数据卷中。

## 管理

查看状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f app
```

执行迁移：

```bash
docker compose exec app php artisan migrate --force
```

重启：

```bash
docker compose restart app
```

停止：

```bash
docker compose down
```

## 备份

备份完整数据卷：

```bash
docker run --rm -v mimo_app_storage:/data -v "$PWD:/backup" alpine tar czf /backup/mimo-app-storage.tgz -C /data .
```

恢复前请先停止容器：

```bash
docker compose down
docker run --rm -v mimo_app_storage:/data -v "$PWD:/backup" alpine sh -lc 'rm -rf /data/* && tar xzf /backup/mimo-app-storage.tgz -C /data'
docker compose up -d
```

## 更新

Docker 方案推荐使用发布镜像。后台「系统设置 / 系统更新」可以检测 GitHub Release 最新版本，并生成 Docker 升级命令。手动升级：

```bash
cd deploy/docker
MIMO_IMAGE=ghcr.io/jinnian0703/mimotts:v1.0.0 docker compose pull app
MIMO_IMAGE=ghcr.io/jinnian0703/mimotts:v1.0.0 docker compose up -d
```

也可以使用脚本：

```bash
sh deploy/docker/upgrade.sh ghcr.io/jinnian0703/mimotts:v1.0.0
```

应用容器启动时会根据 `RUN_MIGRATIONS=true` 自动执行数据库迁移。

默认不建议让 Web 后台直接执行宿主机 Docker 命令。若确实需要，请自行保证 PHP 进程有 Docker 权限，并设置：

```env
MIMO_UPDATE_ALLOW_UPGRADE=true
MIMO_DOCKER_COMPOSE_DIR=/path/to/deploy/docker
```

如果需要从源码构建上传包，请使用仓库根目录的源码上传流程：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-source-upload.ps1
```
