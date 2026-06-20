# 源码上传包

## 目标

源码上传包面向宝塔站点环境。上传包内已经包含前端静态文件、Laravel 后端和 Composer 依赖。服务器只需要上传文件、配置站点和打开域名；首次安装由安装页建表，后续版本如果包含新的数据库迁移，需要按本文的升级迁移步骤执行。

运行模型：

- Nginx 服务静态页面。
- PHP 7.4 执行根目录 `api.php`。
- Laravel 后端位于 `backend`。
- MySQL/MariaDB 信息在首次安装页填写，并写回线上 `backend/.env`。
- 首次数据表由安装流程创建。
- 后续版本迁移通过上传脚本开关或手动 `php artisan migrate --force` 执行。

## 产物

本地生成目录：

```text
dist/source-upload
```

本地生成压缩包：

```text
dist/mimo-source-upload.zip
```

上传 `source-upload` 目录内的全部文件到宝塔站点根目录。不要只上传外层 `source-upload` 文件夹，除非宝塔站点目录直接指向该文件夹。

上传包不包含 `.env` 和 `.user.ini`。线上 `backend/.env` 按示例文件创建并长期保留；如果宝塔站点根目录已有 `.user.ini`，不用覆盖。上传大小、内存和执行时间限制请在宝塔 PHP 7.4 的配置页面调整。

## 包结构

```text
api.php
index.html
install/
login/
settings/
admin/
_next/
backend/
README.txt
README.md
```

## 服务器环境

- 宝塔面板
- Nginx
- MySQL 5.7 或 8.0
- PHP 7.4
- PHP 扩展：`pdo_mysql`、`openssl`、`mbstring`、`fileinfo`、`tokenizer`、`xml`、`ctype`、`json`、`curl`

建议 PHP 配置：

```ini
upload_max_filesize = 100M
post_max_size = 100M
memory_limit = 256M
max_execution_time = 180
```

## 宝塔站点

站点目录设置为上传后的目录：

```text
/www/wwwroot/mimo
```

运行目录保持站点根目录。

默认文档包含：

```text
index.html
```

PHP 版本选择 7.4。首次安装前，按示例文件创建：

```text
backend/.env
```

首次安装需要以下路径可写：

```text
backend/.env
backend/storage
backend/bootstrap/cache
```

## 首次安装

打开站点域名。未安装时系统进入：

```text
https://mimo.example.com/install
```

安装页填写：

- MySQL/MariaDB 主机、端口、数据库名、用户、密码
- 管理员名称、邮箱、密码
- 小米 Mimo API 地址与 API Key
- LinuxDo Connect Client ID、Client Secret、Redirect URI
- SMTP 配置

提交后系统自动执行：

- 保存数据库连接到 `backend/.env` 并建立数据表
- 创建管理员
- 保存 Mimo API、LinuxDo、邮箱配置

LinuxDo Connect 回调地址使用：

```text
https://mimo.example.com/api.php?r=/auth/linuxdo/callback
```

## 构建上传包

在本地项目根目录生成上传包：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-source-upload.ps1
```

该命令只用于生成上传包，不在服务器执行。

只有源码有改动时才需要重新构建并上传。当前线上更新不通过 Docker 重部署。

## 版本升级与迁移

后台「系统设置 / 系统更新」可以检测 GitHub Release 最新版本。默认只生成升级命令，不会从 Web 后台直接执行。若确实需要宝塔源码版后台一键升级，在 `backend/.env` 显式开启：

```env
MIMO_DEPLOYMENT_MODE=source
MIMO_UPDATE_REPOSITORY=jinnian0703/mimotts
MIMO_UPDATE_ALLOW_UPGRADE=true
```

开启后，一键升级会下载 Release 里的 `mimotts-source-upload.zip`，备份当前站点目录，保留 `.env`、运行目录、音频文件和站点图标，再覆盖源码。未开启时，请复制后台生成的命令到服务器执行。

普通源码改动只需要重新构建并上传。上传脚本默认会保留线上 `.env`、上传音频、日志、缓存和会话文件，不会自动动数据库。

如果这次更新包含 `backend/database/migrations` 变更，推荐让上传脚本在文件同步后执行迁移：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/upload-source-upload.ps1 -RunMigrations
```

也可以手动登录服务器执行：

```bash
cd /www/wwwroot/mimo/backend
php artisan migrate --force
```

升级后在管理员后台的系统配置中查看健康检查，或管理员登录后访问：

```text
https://mimo.example.com/api.php?r=/health
```

返回 `status=ok` 表示数据库、存储目录、APP_KEY、站点 URL、Mimo API 和登录方式都可用；`degraded` 表示有配置缺失；`error` 表示数据库、目录权限或 APP_KEY 这类关键项异常。未登录或非管理员访问不会返回诊断细节。
