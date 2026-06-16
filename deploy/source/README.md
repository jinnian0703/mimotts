# 源码上传包

## 目标

源码上传包面向宝塔站点环境。上传包内已经包含前端静态文件、Laravel 后端和 Composer 依赖。服务器只需要上传文件、配置站点和打开域名，不需要执行 Composer、npm、php artisan 或数据库迁移命令。

运行模型：

- Nginx 服务静态页面。
- PHP 7.4 执行根目录 `api.php`。
- Laravel 后端位于 `backend`。
- MySQL 信息由首次安装页写入。
- 数据表由首次安装流程创建。

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

上传包不包含 `.user.ini`。如果宝塔站点根目录已有 `.user.ini`，不用覆盖；上传大小、内存和执行时间限制请在宝塔 PHP 7.4 的配置页面调整。

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

PHP 版本选择 7.4。首次安装需要以下路径可写：

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

- MySQL 连接信息
- 管理员名称、邮箱、密码
- 小米 Mimo API 地址与 API Key
- LinuxDo Connect Client ID、Client Secret、Redirect URI
- SMTP 配置

提交后系统自动执行：

- 写入 `backend/.env`
- 建立数据库表
- 创建管理员
- 保存 Mimo、LinuxDo、邮箱配置

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
