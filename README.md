# Mimo

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Frontend](https://img.shields.io/badge/Frontend-Next.js%2016-black)](frontend)
[![Backend](https://img.shields.io/badge/Backend-Laravel%208-red)](backend)
[![PHP](https://img.shields.io/badge/PHP-7.4-777bb4)](backend/composer.json)
[![Docker](https://img.shields.io/badge/Docker-Compose%20v2-2496ed)](deploy/docker/docker-compose.yml)

Mimo 是一个开源、自托管的小米 MimoTTS 音频任务管理平台。它把语音识别、语音合成、音色设计、声音克隆、账户认证、额度计费和后台运维整合到同一套 Web 系统中，适合部署在自有服务器或团队内部环境。

仓库地址：<https://github.com/jinnian0703/mimo>

## 快速开始

当前推荐的日常更新方式是宝塔源码上传：只有源码有改动时才重新构建上传包并同步到宝塔站点，不再重建 Docker 容器。

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-source-upload.ps1
```

生成结果：

```text
dist/source-upload
dist/mimo-source-upload.zip
```

把 `dist/source-upload` 里的全部文件上传到宝塔站点根目录，或使用上传脚本：

```powershell
$env:MIMO_DEPLOY_HOST = "服务器地址"
$env:MIMO_DEPLOY_TARGET = "/www/wwwroot/mimo.example.com"
$env:MIMO_DEPLOY_SITE_NAME = "mimo.example.com"
$env:MIMO_DEPLOY_KEY = "C:\Users\用户名\.ssh\deploy_key"
powershell -ExecutionPolicy Bypass -File scripts/upload-source-upload.ps1
```

首次安装访问：

```text
https://mimo.example.com/install
```

Docker 配置仍保留在 `deploy/docker/`，只作为独立自托管或测试入口；当前线上更新不再通过 Docker 重部署。

## 核心能力

| 模块 | 能力 |
| --- | --- |
| 音频任务 | 语音转文字、文字转语音、音色设计、声音克隆、任务记录、音频下载 |
| 账户体系 | 邮箱注册登录、邮箱验证、密码管理、两步验证、账号注销、LinuxDo Connect |
| 额度计费 | 套餐配置、默认套餐、积分倍率、接口扣费、余额流水、每日签到 |
| 管理后台 | 用户管理、公告管理、系统配置、Mimo API 配置、邮箱投递配置 |
| 部署交付 | 宝塔源码上传、Docker 标准部署 |

## 技术架构

| 层级 | 技术 |
| --- | --- |
| Frontend | Next.js 16、React 19、Tailwind CSS、shadcn/ui、Radix UI |
| Backend | Laravel 8、PHP 7.4、Laravel Sanctum |
| Database | MySQL 5.7/8.0 或 SQLite |
| Queue/Storage | Laravel 本地队列与本地音频存储 |
| Deployment | 宝塔源码上传、Docker Compose |
| Payment | LinuxDo Credit 易支付兼容网关 |

## 目录结构

```text
mimo/
├── backend/                 Laravel API 服务
├── frontend/                Next.js 前端应用
├── deploy/docker/           Docker 标准部署方案
├── deploy/source/           宝塔源码上传方案
├── docs/                    验收、部署与交付文档
├── scripts/                 构建、上传、验证脚本
├── tests/                   HTTP 冒烟测试说明
└── LICENSE                  MIT 开源许可证
```

## 部署方式

| 方式 | 适合场景 | 入口 |
| --- | --- | --- |
| 宝塔源码上传 | 当前线上更新方式；源码改动后构建上传包 | [`deploy/source/README.md`](deploy/source/README.md) |
| Docker 标准部署 | 独立自托管或测试环境；不作为当前线上更新入口 | [`deploy/docker/README.md`](deploy/docker/README.md) |

## 运行要求

| 组件 | 要求 |
| --- | --- |
| PHP | 7.4 |
| Composer | 2.x |
| Node.js | 当前 LTS 版本 |
| Database | 宝塔源码部署使用 MySQL 5.7/8.0；Docker 标准部署默认 SQLite |
| Docker | Docker Compose v2 |

宝塔源码部署需要启用以下 PHP 扩展：

```text
pdo_mysql
openssl
mbstring
fileinfo
tokenizer
xml
ctype
json
curl
```

建议 PHP 配置：

```ini
upload_max_filesize = 100M
post_max_size = 100M
memory_limit = 256M
max_execution_time = 180
```

## 配置项

核心配置可通过安装向导或环境变量写入。当前宝塔源码部署在安装页填写 MySQL 连接信息；Docker 标准部署默认使用 SQLite，无需在安装页填写数据库信息。

- 数据库连接：SQLite 文件路径，或 MySQL 主机、端口、库名、用户、密码。
- 管理员账户：名称、邮箱、密码。
- Mimo API：接口地址、API Key、超时时间。
- LinuxDo Connect：Client ID、Client Secret、Redirect URI。
- 邮箱服务：SMTP 或邮件 API、发件身份、邮件模板。
- 计费策略：支付网关、套餐、倍率、默认套餐、接口消耗、签到额度、回调地址。

敏感字段不会写入前端构建产物。API 返回会对 API Key、Client Secret、SMTP 密码、邮件 API Token 等字段做脱敏处理。

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

前端 API 地址由 `NEXT_PUBLIC_API_BASE_URL` 控制。宝塔源码上传包默认使用：

```text
/api.php?r=
```

## API 路径

| 路径 | 用途 |
| --- | --- |
| `/auth/*` | 登录、注册、邮箱验证、LinuxDo Connect、退出 |
| `/account/*` | 资料、邮箱、密码、两步验证、账号注销 |
| `/mimo/*` | 音频处理、任务管理、文件下载 |
| `/billing/*` | 套餐展示、支付创建、支付回调 |
| `/quota/*` | 额度摘要、额度记录、每日签到 |
| `/announcements` | 用户公告 |
| `/admin/*` | 管理员配置、用户管理、公告管理、审计记录 |

宝塔源码部署下，API 通过根目录 `api.php` 转发：

```text
/api.php?r=/mimo/tts
```

Docker 标准部署下，API 与前端同域：

```text
/api/mimo/tts
```

## 权限与安全

- 未登录用户只能访问首页、登录页和安装页。
- 普通用户可访问仪表盘、工作台、套餐计费和个人设置。
- 管理员可管理用户、公告、系统配置和计费策略。
- 用户只能访问自己的音频任务与文件。
- 管理员接口不会完整回显敏感密钥。
- `.env`、密钥文件、构建产物、上传音频和运行日志默认不进入 Git。

请勿在 Issue、截图或提交记录中暴露 API Key、数据库密码、支付密钥、SMTP 密码或服务器私钥。

## 验证命令

本地静态检查：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/verify.ps1
```

HTTP 冒烟测试：

```bash
node scripts/verify-http-smoke.mjs
```

前端构建检查：

```bash
cd frontend
npm run lint
npm run build
```

## 发布流程

宝塔源码上传：

```powershell
$env:MIMO_DEPLOY_HOST = "服务器地址"
$env:MIMO_DEPLOY_TARGET = "/www/wwwroot/mimo.example.com"
$env:MIMO_DEPLOY_SITE_NAME = "mimo.example.com"
$env:MIMO_DEPLOY_KEY = "C:\Users\用户名\.ssh\deploy_key"
powershell -ExecutionPolicy Bypass -File scripts/upload-source-upload.ps1
```

上传脚本会执行本地构建、压缩上传、远端备份、文件同步、运行目录保留和关键 PHP 文件语法检查。只有源码有改动时才需要运行上传流程；不要为了普通运行状态重建 Docker。

## 贡献

欢迎提交 Issue 和 Pull Request。建议在提交前完成以下检查：

```bash
cd frontend && npm run lint && npm run build
cd ../backend && composer test
```

贡献建议：

- 保持前后端 API 契约清晰。
- 不提交真实 `.env`、密钥、音频文件或服务器备份。
- UI 改动尽量遵循现有组件、间距、图标和交互模式。
- 涉及计费、认证、文件访问的改动需要补充验证说明。

## Git 忽略范围

仓库默认忽略：

- `frontend/node_modules`、`frontend/.next`、`frontend/out`
- `backend/vendor`
- Laravel 缓存、会话、视图缓存和日志
- `dist` 构建产物与上传包
- 本地环境文件、私钥和密钥文件
- 实际上传或生成的音频文件

## 许可证

Mimo 以 [MIT License](LICENSE) 开源发布。你可以在遵守许可证条款的前提下使用、复制、修改、分发和二次开发本项目。
