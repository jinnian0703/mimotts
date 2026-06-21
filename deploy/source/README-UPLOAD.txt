MimoTTS 源码上传包

适用环境
宝塔面板、Nginx、MySQL、PHP 8.2+。

PHP 扩展
pdo_mysql、openssl、mbstring、fileinfo、tokenizer、xml、ctype、json、curl。

上传
将 source-upload 目录内的全部文件上传到宝塔站点根目录。
站点运行目录保持为站点根目录。
不需要在服务器执行 Composer 或 npm。
首次安装由安装页创建数据表；后续新版本如果包含数据库迁移，使用上传脚本 -RunMigrations，或手动进入 backend 后执行 php artisan migrate --force。
上传包不包含 .env 和 .user.ini；线上 backend/.env 按 backend.env.example 创建并保留，安装页填写的数据库信息会写回这里。如果站点根目录已有 .user.ini，不用覆盖。
上传大小、内存和执行时间限制请在宝塔 PHP 8.2+ 配置页面调整。

目录
api.php：后端接口入口。
backend：Laravel 后端与依赖。
_next、install、login、index.html：前端静态文件。

首次安装
打开站点域名。
进入 /install 后填写数据库、管理员、Mimo API、LinuxDo Connect、SMTP 配置。
提交后系统会把数据库连接写入 backend/.env，创建数据表、创建管理员并保存系统配置。

LinuxDo Connect
回调地址填写：https://你的域名/api.php?r=/auth/linuxdo/callback

宝塔设置
PHP 版本选择 8.2 或更高。
网站目录指向上传后的站点根目录。
默认文档包含 index.html。

文件权限
backend/.env 需要可写。
backend/storage 需要可写。
backend/bootstrap/cache 需要可写。

登录
安装完成后使用管理员邮箱和密码登录。
LinuxDo Connect 参数填写后可使用 LinuxDo 登录。

健康检查
在管理员后台的系统配置中查看，或管理员登录后访问 /api.php?r=/health。
status=ok 表示正常；degraded 表示缺少业务配置；error 表示数据库、目录权限或 APP_KEY 等关键项异常。
