# MimoTTS

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Frontend](https://img.shields.io/badge/Frontend-Next.js%2016-black)](frontend)
[![Backend](https://img.shields.io/badge/Backend-Laravel%208-red)](backend)
[![PHP](https://img.shields.io/badge/PHP-7.4-777bb4)](backend/composer.json)
[![Docker](https://img.shields.io/badge/Docker-Compose%20v2-2496ed)](deploy/docker/docker-compose.yml)

MimoTTS 是一个开源、自托管的小米 MimoTTS 音频任务管理平台，提供语音识别、语音合成、音色设计、声音克隆、账户认证、额度计费和后台管理。

## 功能

- 音频任务：语音转文字、文字转语音、音色设计、声音克隆、任务记录、文件下载。
- 账户体系：邮箱注册登录、邮箱验证、密码管理、两步验证、LinuxDo 登录绑定、账号注销。
- 额度计费：套餐配置、默认套餐、接口扣费、余额流水、每日签到、支付回调。
- 管理后台：用户管理、公告管理、系统配置、Mimo API 配置、邮箱投递配置、系统更新检测。
- 部署方式：源码上传部署、Docker Compose 部署。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| Frontend | Next.js 16、React 19、Tailwind CSS、shadcn/ui |
| Backend | Laravel 8、PHP 7.4、Laravel Sanctum |
| Database | MySQL/MariaDB 或 SQLite |
| Storage | Laravel 本地存储 |
| Deployment | 源码上传、Docker Compose |

## 目录结构

```text
mimo/
├── backend/          Laravel API
├── frontend/         Next.js 前端
├── deploy/docker/    Docker 部署文件
├── deploy/source/    源码上传部署文件
├── scripts/          构建、上传、验证脚本
└── LICENSE
```

## 快速开始

### 源码上传部署

生成源码上传包：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-source-upload.ps1
```

产物位置：

```text
dist/source-upload
dist/mimo-source-upload.zip
```

将 `dist/source-upload` 中的文件上传到站点根目录，然后访问安装页：

```text
https://your-domain.example/install
```

源码上传部署说明见 [deploy/source/README.md](deploy/source/README.md)。

### Docker 部署

```bash
cd deploy/docker
cp .env.example .env
docker compose --env-file .env -f docker-compose.yml up -d --build
```

访问：

```text
http://your-server:18081
```

Docker 部署说明见 [deploy/docker/README.md](deploy/docker/README.md)。

## 运行要求

源码上传部署：

- PHP 7.4
- Composer 2.x
- MySQL 5.7/8.0 或 MariaDB
- PHP 扩展：`pdo_mysql`、`openssl`、`mbstring`、`fileinfo`、`tokenizer`、`xml`、`ctype`、`json`、`curl`

Docker 部署：

- Docker
- Docker Compose v2

## 配置

首次安装在安装页填写：

- 数据库连接
- 管理员账户
- Mimo API 地址与 API Key
- LinuxDo Connect
- 邮箱投递配置

敏感配置保存在后端环境文件或数据库加密配置中，不应提交到 Git。

## 本地开发

后端：

```bash
cd backend
composer install
composer test
```

前端：

```bash
cd frontend
npm install
npm run lint
npm run build
```

## API

| 路径 | 用途 |
| --- | --- |
| `/auth/*` | 登录、注册、邮箱验证、LinuxDo 登录 |
| `/account/*` | 资料、邮箱、密码、两步验证、LinuxDo 绑定、账号注销 |
| `/mimo/*` | 音频处理、任务管理、文件下载 |
| `/billing/*` | 套餐、支付、回调 |
| `/quota/*` | 额度摘要、流水、签到 |
| `/announcements` | 用户公告 |
| `/admin/*` | 管理后台 |
| `/health` | 健康检查 |

源码上传部署下，API 通过根目录 `api.php` 转发：

```text
/api.php?r=/mimo/tts
```

Docker 部署下，API 路径为：

```text
/api/mimo/tts
```

## 安全

- 不提交真实 `.env`、密钥、数据库密码、SMTP 密码、支付密钥或服务器私钥。
- 不提交上传音频、生成音频、运行日志、缓存或备份文件。
- 管理员接口不会完整回显敏感密钥。
- 用户只能访问自己的音频任务与文件。

## 验证

前端：

```bash
cd frontend
npm run lint
npm run build
```

后端：

```bash
cd backend
composer test
```

HTTP 冒烟测试：

```bash
node scripts/verify-http-smoke.mjs
```

## 许可证

MimoTTS 以 [MIT License](LICENSE) 开源发布。
