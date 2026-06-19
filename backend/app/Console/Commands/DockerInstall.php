<?php

namespace App\Console\Commands;

use App\Models\SystemSetting;
use App\Models\User;
use App\Services\BillingConfigService;
use App\Services\InstallService;
use App\Services\MimoConfigService;
use App\Services\QuotaService;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

class DockerInstall extends Command
{
    protected $signature = 'mimo:docker-install';

    protected $description = 'Initialize a Docker deployment from environment variables';

    public function handle(InstallService $install, QuotaService $quota, BillingConfigService $billing): int
    {
        $createdAdmin = false;
        $plainPassword = null;
        $syncConfig = false;

        if (! $install->isInstalled()) {
            $plainPassword = $this->adminPassword();
            $admin = User::query()->create([
                'name' => $this->envString('MIMO_ADMIN_NAME', 'MimoTTS Admin'),
                'email' => Str::lower($this->envString('MIMO_ADMIN_EMAIL', 'admin@mimotts.local')),
                'password' => $plainPassword,
                'is_admin' => true,
                'email_verified_at' => now(),
                'status' => 'active',
                'last_login_at' => now(),
            ]);

            $quota->grantDefaultPlan($admin, $billing->defaultPlan());

            SystemSetting::putPlain('installation', [
                'installed_at' => now()->toISOString(),
                'admin_user_id' => $admin->id,
                'email_login_enabled' => $this->envBool('EMAIL_LOGIN_ENABLED', true),
                'linuxdo_configured' => $this->linuxDoConfigured(),
                'source' => 'docker_env',
            ]);

            $createdAdmin = true;
            $syncConfig = true;
        } else {
            $syncConfig = $this->envBool('MIMO_DOCKER_SYNC_CONFIG', false);
        }

        if ($syncConfig) {
            $this->syncRuntimeSettings($install);
        }

        if ($createdAdmin) {
            $this->line('MimoTTS Docker 初始化完成。');
            $this->line('管理员账号：'.$this->envString('MIMO_ADMIN_EMAIL', 'admin@mimotts.local'));
            $this->line('管理员密码：'.$plainPassword);
            $this->line('请登录后立即修改管理员密码。');
            $this->line('以后可执行：docker compose logs app | grep "管理员"');
        } else {
            $this->line($syncConfig
                ? 'MimoTTS Docker 已安装，跳过管理员创建并同步启动配置。'
                : 'MimoTTS Docker 已安装，跳过管理员创建。'
            );
        }

        if ($syncConfig) {
            $this->line('Mimo API：'.($this->envString('MIMO_API_KEY', '') !== '' ? '已配置' : '未配置'));
            $this->line('LinuxDo 登录：'.($this->linuxDoConfigured() && $this->envBool('LINUXDO_LOGIN_ENABLED', true) ? '已配置' : '未配置'));
            $this->line('邮箱登录：'.($this->envBool('EMAIL_LOGIN_ENABLED', true) ? '启用' : '停用'));
            $this->line('用户注册：'.($this->envBool('EMAIL_REGISTRATION_ENABLED', true) ? '启用' : '停用'));
        }

        return self::SUCCESS;
    }

    private function syncRuntimeSettings(InstallService $install): void
    {
        $mimoApiKey = $this->envString('MIMO_API_KEY', '');
        if ($mimoApiKey !== '') {
            app(MimoConfigService::class)->setSystemConfig(
                $mimoApiKey,
                $this->envString('MIMO_BASE_URL', 'https://api.xiaomimimo.com/v1')
            );
        }

        $install->setLinuxDoConfig([
            'enabled' => $this->envBool('LINUXDO_LOGIN_ENABLED', true),
            'client_id' => $this->envString('LINUXDO_CLIENT_ID', ''),
            'client_secret' => $this->envString('LINUXDO_CLIENT_SECRET', ''),
            'redirect_uri' => $this->envString('LINUXDO_REDIRECT_URI', rtrim(config('app.url'), '/').'/api/auth/linuxdo/callback'),
        ]);

        $install->setEmailAuthConfig($this->emailConfig());
    }

    private function emailConfig(): array
    {
        return [
            'enabled' => $this->envBool('EMAIL_LOGIN_ENABLED', true),
            'registration_enabled' => $this->envBool('EMAIL_REGISTRATION_ENABLED', true),
            'verification_required' => $this->envBool('EMAIL_VERIFICATION_REQUIRED', false),
            'driver' => $this->envString('MAIL_DRIVER', $this->envString('MAIL_MAILER', 'smtp')) === 'api' ? 'api' : 'smtp',
            'smtp' => [
                'host' => $this->envString('MAIL_HOST', ''),
                'port' => $this->envInt('MAIL_PORT', 587),
                'username' => $this->envString('MAIL_USERNAME', ''),
                'password' => $this->envString('MAIL_PASSWORD', ''),
                'encryption' => $this->envString('MAIL_ENCRYPTION', 'tls'),
            ],
            'api' => [
                'provider' => $this->envString('MAIL_API_PROVIDER', 'generic_json'),
                'endpoint' => $this->envString('MAIL_API_ENDPOINT', ''),
                'token' => $this->envString('MAIL_API_TOKEN', ''),
            ],
            'sender' => [
                'address' => $this->envString('MAIL_FROM_ADDRESS', ''),
                'name' => $this->envString('MAIL_FROM_NAME', 'MimoTTS'),
            ],
        ];
    }

    private function adminPassword(): string
    {
        $configured = $this->envString('MIMO_ADMIN_PASSWORD', '');

        return $configured !== '' ? $configured : Str::random(20);
    }

    private function linuxDoConfigured(): bool
    {
        return $this->envString('LINUXDO_CLIENT_ID', '') !== ''
            && $this->envString('LINUXDO_CLIENT_SECRET', '') !== '';
    }

    private function envString(string $key, string $default = ''): string
    {
        $value = $this->envValue($key);

        if ($value === null || $value === false) {
            return $default;
        }

        return trim((string) $value);
    }

    private function envBool(string $key, bool $default): bool
    {
        $value = $this->envValue($key);

        if ($value === null || $value === '') {
            return $default;
        }

        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    private function envInt(string $key, int $default): int
    {
        $value = $this->envValue($key);

        if ($value === null || $value === '' || ! is_numeric($value)) {
            return $default;
        }

        return (int) $value;
    }

    private function envValue(string $key)
    {
        $value = getenv($key);
        if ($value !== false) {
            return $value;
        }

        if (array_key_exists($key, $_ENV)) {
            return $_ENV[$key];
        }

        if (array_key_exists($key, $_SERVER)) {
            return $_SERVER[$key];
        }

        return env($key);
    }
}
