<?php

namespace App\Services;

use App\Models\SystemSetting;
use App\Models\User;

class InstallService
{
    public const EMAIL_AUTH_KEY = 'email_auth_config';
    public const LINUXDO_AUTH_KEY = 'linuxdo_connect_config';
    public const STATE_UNINSTALLED = 'uninstalled';
    public const STATE_INSTALLED = 'installed';
    public const STATE_INSTALLED_NEEDS_CONFIG = 'installed_needs_config';
    public const STATE_CONFIG_ERROR = 'config_error';

    public function isInstalled(): bool
    {
        return User::where('is_admin', true)->exists()
            && SystemSetting::where('key', 'installation')->exists();
    }

    public function status(): array
    {
        $emailConfig = $this->emailAuthConfig();
        $linuxDoConfig = $this->linuxDoConfig();
        $linuxDoConfigured = (bool) ($linuxDoConfig['configured'] ?? false);
        $linuxDoLoginEnabled = $linuxDoConfigured && (bool) ($linuxDoConfig['enabled'] ?? true);
        $adminBound = User::where('is_admin', true)->exists();
        $installed = $adminBound && SystemSetting::where('key', 'installation')->exists();
        $mimoConfigured = (bool) $this->mimoConfig()['api_key'];
        $missingConfig = $this->missingConfig($installed, $mimoConfigured, $linuxDoLoginEnabled, $emailConfig);
        $installState = $this->installState($installed, $missingConfig);

        return [
            'installed' => $installed,
            'install_state' => $installState,
            'installState' => $installState,
            'state_message' => $this->stateMessage($installState),
            'stateMessage' => $this->stateMessage($installState),
            'missing_config' => $missingConfig,
            'missingConfig' => $missingConfig,
            'build' => app(BuildInfoService::class)->info(),
            'deployment' => $this->deploymentInfo(),
            'admin_bound' => $adminBound,
            'administratorBound' => $adminBound,
            'mimo_configured' => $mimoConfigured,
            'linuxdo_configured' => $linuxDoConfigured,
            'linuxDoConfigured' => $linuxDoConfigured,
            'linuxdo_login_enabled' => $linuxDoLoginEnabled,
            'linuxDoLoginEnabled' => $linuxDoLoginEnabled,
            'registration_enabled' => $emailConfig['registration_enabled'],
            'registrationEnabled' => $emailConfig['registration_enabled'],
            'email_login_enabled' => $emailConfig['enabled'],
            'email_auth_enabled' => $emailConfig['enabled'],
            'emailLoginEnabled' => $emailConfig['enabled'],
            'emailAuthEnabled' => $emailConfig['enabled'],
            'email_auth' => [
                'enabled' => $emailConfig['enabled'],
                'registration_enabled' => $emailConfig['registration_enabled'],
                'verification_required' => $emailConfig['verification_required'],
                'smtp_configured' => $emailConfig['smtp_configured'],
                'sender_configured' => $emailConfig['sender_configured'],
            ],
        ];
    }

    public function complete(User $admin, array $mimoConfig = [], array $emailConfig = []): void
    {
        $admin->forceFill(['is_admin' => true])->save();

        if (! empty($mimoConfig['api_key'])) {
            app(MimoConfigService::class)->setSystemConfig(
                $mimoConfig['api_key'],
                $mimoConfig['base_url'] ?? null
            );
        }

        $this->setEmailAuthConfig($emailConfig);

        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
            'email_login_enabled' => (bool) ($emailConfig['enabled'] ?? false),
        ]);
    }

    public function emailAuthConfig(): array
    {
        $value = $this->storedEmailAuthConfig();
        $smtp = $value['smtp'] ?? [];
        $api = $value['api'] ?? [];
        $sender = $value['sender'] ?? [];
        $templates = app(EmailTemplateService::class)->normalizeTemplates($value['templates'] ?? []);

        return [
            'enabled' => (bool) ($value['enabled'] ?? false),
            'registration_enabled' => array_key_exists('registration_enabled', $value)
                ? (bool) $value['registration_enabled']
                : true,
            'verification_required' => (bool) ($value['verification_required'] ?? false),
            'driver' => ($value['driver'] ?? 'smtp') === 'api' ? 'api' : 'smtp',
            'smtp' => [
                'host' => $smtp['host'] ?? null,
                'port' => $smtp['port'] ?? null,
                'username' => $smtp['username'] ?? null,
                'password_configured' => ! empty($smtp['password']),
                'encryption' => $smtp['encryption'] ?? null,
            ],
            'api' => [
                'provider' => $api['provider'] ?? 'generic_json',
                'endpoint' => $api['endpoint'] ?? null,
                'token_configured' => ! empty($api['token']),
            ],
            'sender' => [
                'address' => $sender['address'] ?? null,
                'name' => $sender['name'] ?? null,
            ],
            'templates' => $templates,
            'smtp_configured' => ! empty($smtp['host']) && ! empty($smtp['port']),
            'api_configured' => ! empty($api['endpoint']) && ! empty($api['token']),
            'sender_configured' => ! empty($sender['address']),
            'linuxdo' => $this->linuxDoConfig(),
        ];
    }

    public function emailAuthConfigForUpdate(): array
    {
        return $this->storedEmailAuthConfig();
    }

    public function setEmailAuthConfig(array $config): void
    {
        SystemSetting::putEncrypted(self::EMAIL_AUTH_KEY, [
            'enabled' => (bool) ($config['enabled'] ?? false),
            'registration_enabled' => array_key_exists('registration_enabled', $config)
                ? (bool) $config['registration_enabled']
                : true,
            'verification_required' => (bool) ($config['verification_required'] ?? false),
            'driver' => ($config['driver'] ?? 'smtp') === 'api' ? 'api' : 'smtp',
            'smtp' => [
                'host' => $config['smtp']['host'] ?? null,
                'port' => isset($config['smtp']['port']) ? (int) $config['smtp']['port'] : null,
                'username' => $config['smtp']['username'] ?? null,
                'password' => $config['smtp']['password'] ?? null,
                'encryption' => $config['smtp']['encryption'] ?? null,
            ],
            'api' => [
                'provider' => $config['api']['provider'] ?? 'generic_json',
                'endpoint' => $config['api']['endpoint'] ?? null,
                'token' => $config['api']['token'] ?? null,
            ],
            'sender' => [
                'address' => $config['sender']['address'] ?? null,
                'name' => $config['sender']['name'] ?? null,
            ],
            'templates' => app(EmailTemplateService::class)->normalizeTemplates($config['templates'] ?? []),
        ]);
    }

    public function linuxDoConfig(): array
    {
        $value = $this->storedLinuxDoConfig();

        return [
            'enabled' => array_key_exists('enabled', $value) ? (bool) $value['enabled'] : true,
            'client_id' => $value['client_id'] ?? config('services.linuxdo.client_id'),
            'client_secret_configured' => ! empty($value['client_secret'] ?? config('services.linuxdo.client_secret')),
            'redirect_uri' => $value['redirect_uri'] ?? config('services.linuxdo.redirect_uri'),
            'configured' => ! empty($value['client_id'] ?? config('services.linuxdo.client_id'))
                && ! empty($value['client_secret'] ?? config('services.linuxdo.client_secret'))
                && ! empty($value['redirect_uri'] ?? config('services.linuxdo.redirect_uri')),
        ];
    }

    public function linuxDoConfigForUpdate(): array
    {
        return $this->storedLinuxDoConfig() + [
            'client_id' => config('services.linuxdo.client_id'),
            'client_secret' => config('services.linuxdo.client_secret'),
            'redirect_uri' => config('services.linuxdo.redirect_uri'),
        ];
    }

    public function setLinuxDoConfig(array $config): void
    {
        SystemSetting::putEncrypted(self::LINUXDO_AUTH_KEY, [
            'enabled' => array_key_exists('enabled', $config) ? (bool) $config['enabled'] : true,
            'client_id' => $config['client_id'] ?? null,
            'client_secret' => $config['client_secret'] ?? null,
            'redirect_uri' => $config['redirect_uri'] ?? null,
        ]);
    }

    private function storedEmailAuthConfig(): array
    {
        $setting = SystemSetting::where('key', self::EMAIL_AUTH_KEY)->first();

        return $setting ? $setting->decodedValue() : [];
    }

    private function mimoConfig(): array
    {
        return app(MimoConfigService::class)->systemConfig();
    }

    private function storedLinuxDoConfig(): array
    {
        $setting = SystemSetting::where('key', self::LINUXDO_AUTH_KEY)->first();

        if ($setting) {
            return $setting->decodedValue() ?: [];
        }

        return [];
    }

    private function missingConfig(bool $installed, bool $mimoConfigured, bool $linuxDoConfigured, array $emailConfig): array
    {
        if (! $installed) {
            return [];
        }

        $missing = [];
        if (! $mimoConfigured) {
            $missing[] = 'mimo_api';
        }
        if (! ($emailConfig['enabled'] ?? false) && ! $linuxDoConfigured) {
            $missing[] = 'auth_method';
        }
        if (($emailConfig['enabled'] ?? false) && ! ($emailConfig['sender_configured'] ?? false)) {
            $missing[] = 'email_sender';
        }

        return $missing;
    }

    private function deploymentInfo(): array
    {
        $mode = strtolower((string) env('MIMO_DEPLOYMENT_MODE', ''));
        if ($mode !== 'docker' && $mode !== 'source') {
            $mode = $this->detectDeploymentMode();
        }

        return [
            'mode' => $mode,
            'label' => $mode === 'docker' ? 'Docker 版' : '宝塔源码版',
        ];
    }

    private function detectDeploymentMode(): string
    {
        if ($this->canInspectRoot() && is_file('/.dockerenv')) {
            return 'docker';
        }

        return 'source';
    }

    private function canInspectRoot(): bool
    {
        $openBasedir = (string) ini_get('open_basedir');
        if ($openBasedir === '') {
            return true;
        }

        foreach (explode(PATH_SEPARATOR, $openBasedir) as $path) {
            if (trim($path) === '/') {
                return true;
            }
        }

        return false;
    }

    private function installState(bool $installed, array $missingConfig): string
    {
        if (! $installed) {
            return self::STATE_UNINSTALLED;
        }

        return $missingConfig ? self::STATE_INSTALLED_NEEDS_CONFIG : self::STATE_INSTALLED;
    }

    private function stateMessage(string $state): string
    {
        return [
            self::STATE_UNINSTALLED => '系统未安装',
            self::STATE_INSTALLED => '系统已安装',
            self::STATE_INSTALLED_NEEDS_CONFIG => '系统已安装，但仍有关键配置缺失',
            self::STATE_CONFIG_ERROR => '系统配置读取异常',
        ][$state] ?? $state;
    }
}
