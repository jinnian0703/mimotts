<?php

namespace App\Services;

use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PDOException;
use RuntimeException;

class WebInstallService
{
    public function status(): array
    {
        $storagePaths = [
            storage_path(),
            storage_path('framework'),
            storage_path('framework/cache'),
            storage_path('framework/sessions'),
            storage_path('framework/views'),
            storage_path('logs'),
        ];

        return [
            'php_version' => PHP_VERSION,
            'checks' => [
                'php' => version_compare(PHP_VERSION, '8.2.0', '>='),
                'pdo_mysql' => extension_loaded('pdo_mysql'),
                'pdo_sqlite' => extension_loaded('pdo_sqlite'),
                'openssl' => extension_loaded('openssl'),
                'mbstring' => extension_loaded('mbstring'),
                'fileinfo' => extension_loaded('fileinfo'),
                'storage_writable' => $this->pathsWritable($storagePaths),
                'cache_writable' => is_writable(base_path('bootstrap/cache')),
            ],
            'optional_checks' => [
                'fileinfo' => extension_loaded('fileinfo'),
            ],
        ];
    }

    public function install(array $data): User
    {
        $this->assertEnvironment($data);
        $this->testDatabase($data);
        $appKey = $this->applicationKey();
        $this->applyRuntimeConfig($data, $appKey);
        $this->persistEnvironmentConfig($data, $appKey);
        $this->runMigrations();

        $admin = User::query()->create([
            'name' => $data['admin_name'],
            'email' => Str::lower($data['admin_email']),
            'password' => $data['admin_password'],
            'is_admin' => true,
            'email_verified_at' => now(),
            'status' => 'active',
            'last_login_at' => now(),
        ]);

        if (! empty($data['mimo_api_key'])) {
            app(MimoConfigService::class)->setSystemConfig(
                $data['mimo_api_key'],
                $data['mimo_base_url'] ?? null
            );
        }

        if (! empty($data['linuxdo_client_id']) && ! empty($data['linuxdo_client_secret'])) {
            SystemSetting::putEncrypted(InstallService::LINUXDO_AUTH_KEY, [
                'enabled' => true,
                'client_id' => $data['linuxdo_client_id'] ?? '',
                'client_secret' => $data['linuxdo_client_secret'] ?? '',
                'redirect_uri' => $data['linuxdo_redirect_uri'] ?? $this->defaultLinuxDoRedirectUri($data['app_url']),
            ]);
        }

        SystemSetting::putPlain('basic_info', [
            'system_name' => config('app.name', 'MimoTTS'),
            'site_title' => config('app.name', 'MimoTTS'),
            'site_subtitle' => null,
            'icon_url' => null,
            'app_url' => $data['app_url'],
            'frontend_url' => $data['frontend_url'],
            'icp_record' => null,
            'footer_text' => null,
            'support_email' => null,
        ]);

        $emailConfig = $data['email_config'] ?? [];
        app(InstallService::class)->setEmailAuthConfig($emailConfig);

        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
            'email_login_enabled' => (bool) ($emailConfig['enabled'] ?? false),
            'linuxdo_configured' => ! empty($data['linuxdo_client_id']) && ! empty($data['linuxdo_client_secret']),
            'source' => 'web_installer',
        ]);

        return $admin;
    }

    public function testDatabase(array $data): void
    {
        try {
            $this->configureDatabase($data);
            DB::connection($this->databaseConnection($data))->getPdo();
        } catch (PDOException $e) {
            throw new RuntimeException('数据库连接失败，请检查数据库配置');
        }
    }

    private function assertEnvironment(array $data): void
    {
        $status = $this->status();
        $connection = $this->databaseConnection($data);

        foreach ($status['checks'] as $key => $passed) {
            if ($key === 'pdo_sqlite' && $connection !== 'sqlite') {
                continue;
            }

            if ($key === 'pdo_mysql' && $connection !== 'mysql') {
                continue;
            }

            if (! $passed) {
                throw new RuntimeException($this->checkMessage($key));
            }
        }
    }

    private function configureDatabase(array $data): void
    {
        $connection = $this->databaseConnection($data);
        Config::set('database.default', $connection);

        if ($connection === 'sqlite') {
            $path = $data['db_database'] ?? config('database.connections.sqlite.database');
            Config::set('database.connections.sqlite.database', $path);
        } else {
            Config::set('database.connections.mysql.host', $data['db_host'] ?? config('database.connections.mysql.host'));
            Config::set('database.connections.mysql.port', (string) ($data['db_port'] ?? config('database.connections.mysql.port')));
            Config::set('database.connections.mysql.database', $data['db_database'] ?? config('database.connections.mysql.database'));
            Config::set('database.connections.mysql.username', $data['db_username'] ?? config('database.connections.mysql.username'));
            Config::set('database.connections.mysql.password', $data['db_password'] ?? config('database.connections.mysql.password'));
            Config::set('database.connections.mysql.charset', 'utf8mb4');
            Config::set('database.connections.mysql.collation', 'utf8mb4_unicode_ci');
        }

        DB::purge($connection);
        DB::reconnect($connection);
    }

    private function applyRuntimeConfig(array $data, string $appKey): void
    {
        $this->configureDatabase($data);

        Config::set('app.key', $appKey);
        app()->forgetInstance('encrypter');
        Crypt::clearResolvedInstance('encrypter');
        Config::set('app.url', $data['app_url']);
        Config::set('app.frontend_url', $data['frontend_url']);
        Config::set('cache.default', config('cache.default'));
        Config::set('session.driver', config('session.driver'));
        Config::set('session.secure', Str::startsWith($data['app_url'], 'https://'));
        Config::set('session.same_site', 'lax');
        Config::set('cors.allowed_origins', [$data['frontend_url']]);
        Config::set('sanctum.stateful', $this->statefulDomains($data['frontend_url'], $data['app_url']));
        Config::set('services.linuxdo.client_id', $data['linuxdo_client_id'] ?? '');
        Config::set('services.linuxdo.client_secret', $data['linuxdo_client_secret'] ?? '');
        Config::set('services.linuxdo.redirect_uri', $data['linuxdo_redirect_uri'] ?? $this->defaultLinuxDoRedirectUri($data['app_url']));
        Config::set('services.mimo.base_url', $data['mimo_base_url'] ?? 'https://api.xiaomimimo.com/v1');
        Config::set('services.mimo.api_key', $data['mimo_api_key'] ?? '');
    }

    private function persistEnvironmentConfig(array $data, string $appKey): void
    {
        $path = base_path('.env');
        $lines = is_file($path) ? file($path, FILE_IGNORE_NEW_LINES) : [];

        if ($lines === false) {
            throw new RuntimeException('无法读取 backend/.env');
        }

        $content = $this->mergeEnvironmentLines($lines, $this->environmentValues($data, $appKey));

        if (file_put_contents($path, $content, LOCK_EX) === false) {
            throw new RuntimeException('无法写入 backend/.env，请检查文件权限');
        }
    }

    private function environmentValues(array $data, string $appKey): array
    {
        $connection = $this->databaseConnection($data);
        $emailConfig = $data['email_config'] ?? [];
        $smtp = $emailConfig['smtp'] ?? [];
        $sender = $emailConfig['sender'] ?? [];
        $linuxDoRedirectUri = $data['linuxdo_redirect_uri'] ?? $this->defaultLinuxDoRedirectUri($data['app_url']);

        $values = [
            'APP_NAME' => config('app.name', 'MimoTTS'),
            'APP_ENV' => config('app.env', 'production'),
            'APP_KEY' => $appKey,
            'APP_DEBUG' => config('app.debug') ? 'true' : 'false',
            'APP_URL' => $data['app_url'],
            'FRONTEND_URL' => $data['frontend_url'],
            'DB_CONNECTION' => $connection,
            'DB_DATABASE' => $data['db_database'] ?? config('database.connections.'.$connection.'.database'),
            'SESSION_SECURE_COOKIE' => Str::startsWith($data['app_url'], 'https://') ? 'true' : 'false',
            'SESSION_SAME_SITE' => 'lax',
            'SANCTUM_STATEFUL_DOMAINS' => implode(',', $this->statefulDomains($data['frontend_url'], $data['app_url'])),
            'CORS_ALLOWED_ORIGINS' => $data['frontend_url'],
            'LINUXDO_CLIENT_ID' => $data['linuxdo_client_id'] ?? '',
            'LINUXDO_CLIENT_SECRET' => $data['linuxdo_client_secret'] ?? '',
            'LINUXDO_REDIRECT_URI' => $linuxDoRedirectUri,
            'MIMO_BASE_URL' => $data['mimo_base_url'] ?? 'https://api.xiaomimimo.com/v1',
            'MIMO_API_KEY' => $data['mimo_api_key'] ?? '',
            'MAIL_MAILER' => $emailConfig['driver'] ?? 'smtp',
            'MAIL_HOST' => $smtp['host'] ?? '',
            'MAIL_PORT' => $smtp['port'] ?? 587,
            'MAIL_USERNAME' => $smtp['username'] ?? '',
            'MAIL_PASSWORD' => $smtp['password'] ?? '',
            'MAIL_ENCRYPTION' => $smtp['encryption'] ?? 'tls',
            'MAIL_FROM_ADDRESS' => $sender['address'] ?? '',
            'MAIL_FROM_NAME' => $sender['name'] ?? 'MimoTTS',
        ];

        if ($connection === 'mysql') {
            $values['DB_HOST'] = $data['db_host'] ?? config('database.connections.mysql.host');
            $values['DB_PORT'] = $data['db_port'] ?? config('database.connections.mysql.port');
            $values['DB_USERNAME'] = $data['db_username'] ?? config('database.connections.mysql.username');
            $values['DB_PASSWORD'] = $data['db_password'] ?? config('database.connections.mysql.password');
        }

        return $values;
    }

    private function mergeEnvironmentLines(array $lines, array $values): string
    {
        $remaining = $values;
        $merged = [];

        foreach ($lines as $line) {
            if (preg_match('/^\s*([A-Z0-9_]+)\s*=/', $line, $matches)) {
                $key = $matches[1];

                if (array_key_exists($key, $remaining)) {
                    $merged[] = $key.'='.$this->formatEnvironmentValue($remaining[$key]);
                    unset($remaining[$key]);
                    continue;
                }
            }

            $merged[] = $line;
        }

        if ($remaining) {
            if ($merged && trim(end($merged)) !== '') {
                $merged[] = '';
            }

            foreach ($remaining as $key => $value) {
                $merged[] = $key.'='.$this->formatEnvironmentValue($value);
            }
        }

        return implode("\n", $merged)."\n";
    }

    private function formatEnvironmentValue($value): string
    {
        if ($value === null) {
            return '';
        }

        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }

        $value = (string) $value;

        if ($value === '') {
            return '';
        }

        if (preg_match('/^[A-Za-z0-9_.:\/?&=@,\-]+$/', $value)) {
            return $value;
        }

        return '"'.str_replace(
            ["\\", '"', "\n", "\r"],
            ["\\\\", '\"', '\n', ''],
            $value
        ).'"';
    }

    private function runMigrations(): void
    {
        Artisan::call('migrate', [
            '--force' => true,
        ]);
    }

    private function statefulDomains(string $frontendUrl, string $appUrl): array
    {
        $domains = [];

        foreach ([$frontendUrl, $appUrl] as $url) {
            $host = parse_url($url, PHP_URL_HOST);
            if (! $host) {
                continue;
            }

            $port = parse_url($url, PHP_URL_PORT);
            $domains[] = $port ? $host.':'.$port : $host;
        }

        return array_values(array_unique($domains));
    }

    private function databaseConnection(array $data): string
    {
        return ($data['db_connection'] ?? config('database.default')) === 'mysql' ? 'mysql' : 'sqlite';
    }

    private function applicationKey(): string
    {
        $key = trim((string) config('app.key'));

        if ($key === '' || $key === 'replace_with_generated_laravel_app_key') {
            return 'base64:'.base64_encode(random_bytes(32));
        }

        return $key;
    }

    private function defaultLinuxDoRedirectUri(string $appUrl): string
    {
        return rtrim($appUrl, '/').'/api/auth/linuxdo/callback';
    }

    private function pathsWritable(array $paths): bool
    {
        foreach ($paths as $path) {
            if (! is_dir($path) || ! is_writable($path)) {
                return false;
            }
        }

        return true;
    }

    private function checkMessage(string $key): string
    {
        $messages = [
            'php' => 'PHP 版本需为 8.2 或更高',
            'pdo_mysql' => 'PHP 扩展 pdo_mysql 未启用',
            'pdo_sqlite' => 'PHP 扩展 pdo_sqlite 未启用',
            'openssl' => 'PHP 扩展 openssl 未启用',
            'mbstring' => 'PHP 扩展 mbstring 未启用',
            'fileinfo' => 'PHP 扩展 fileinfo 未启用',
            'storage_writable' => '后端 storage 目录不可写',
            'cache_writable' => '后端 bootstrap/cache 目录不可写',
        ];

        return $messages[$key] ?? '安装环境检查未通过：'.$key;
    }
}
