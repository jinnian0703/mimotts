Mimo 源码上传包

适用环境
宝塔面板、Nginx、MySQL、PHP 7.4。

PHP 扩展
pdo_mysql、openssl、mbstring、fileinfo、tokenizer、xml、ctype、json、curl。

上传
将 source-upload 目录内的全部文件上传到宝塔站点根目录。
站点运行目录保持为站点根目录。
不需要在服务器执行 Composer、npm、php artisan 或迁移命令。
上传包不包含 .user.ini；如果站点根目录已有 .user.ini，不用覆盖。
上传大小、内存和执行时间限制请在宝塔 PHP 7.4 配置页面调整。

目录
api.php：后端接口入口。
backend：Laravel 后端与依赖。
_next、install、login、index.html：前端静态文件。

首次安装
打开站点域名。
进入 /install 后填写数据库、管理员、Mimo API、LinuxDo Connect、SMTP 配置。
提交后系统会写入 backend/.env、创建数据表、创建管理员并保存系统配置。

LinuxDo Connect
回调地址填写：https://你的域名/api.php?r=/auth/linuxdo/callback

宝塔设置
PHP 版本选择 7.4。
网站目录指向上传后的站点根目录。
默认文档包含 index.html。

文件权限
backend/.env 需要可写。
backend/storage 需要可写。
backend/bootstrap/cache 需要可写。

登录
安装完成后使用管理员邮箱和密码登录。
LinuxDo Connect 参数填写后可使用 LinuxDo 登录。
