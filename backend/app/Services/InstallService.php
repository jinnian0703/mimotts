<?php

namespace App\Services;

use App\Models\SystemSetting;
use App\Models\User;

class InstallService
{
    public const EMAIL_AUTH_KEY = 'email_auth_config';

    public function isInstalled(): bool
    {
        return User::where('is_admin', true)->exists()
            && SystemSetting::where('key', 'installation')->exists();
    }

    public function status(): array
    {
        $emailConfig = $this->emailAuthConfig();
        $linuxDoConfig = $this->linuxDoConfig();
        $linuxDoConfigured = ! empty($linuxDoConfig['client_id'])
            && ! empty($linuxDoConfig['client_secret']);

        return [
            'installed' => $this->isInstalled(),
            'admin_bound' => User::where('is_admin', true)->exists(),
            'administratorBound' => User::where('is_admin', true)->exists(),
            'mimo_configured' => (bool) $this->mimoConfig()['api_key'],
            'linuxdo_configured' => $linuxDoConfigured,
            'linuxDoConfigured' => $linuxDoConfigured,
            'email_login_enabled' => $emailConfig['enabled'],
            'email_auth_enabled' => $emailConfig['enabled'],
            'emailLoginEnabled' => $emailConfig['enabled'],
            'emailAuthEnabled' => $emailConfig['enabled'],
            'email_auth' => [
                'enabled' => $emailConfig['enabled'],
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

    private function storedEmailAuthConfig(): array
    {
        $setting = SystemSetting::where('key', self::EMAIL_AUTH_KEY)->first();

        return $setting ? $setting->decodedValue() : [];
    }

    private function mimoConfig(): array
    {
        return app(MimoConfigService::class)->systemConfig();
    }

    private function linuxDoConfig(): array
    {
        $setting = SystemSetting::where('key', 'linuxdo_connect_config')->first();

        if ($setting) {
            return $setting->decodedValue() ?: [];
        }

        return [
            'client_id' => config('services.linuxdo.client_id'),
            'client_secret' => config('services.linuxdo.client_secret'),
        ];
    }
}
