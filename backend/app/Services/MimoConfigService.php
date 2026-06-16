<?php

namespace App\Services;

use App\Models\SystemSetting;
use App\Models\User;

class MimoConfigService
{
    public const SYSTEM_KEY = 'mimo_api_config';

    public function systemConfig(): array
    {
        $setting = SystemSetting::where('key', self::SYSTEM_KEY)->first();
        $value = $setting ? $setting->decodedValue() : [];

        return [
            'base_url' => $value['base_url'] ?? config('services.mimo.base_url'),
            'api_key' => $value['api_key'] ?? config('services.mimo.api_key'),
            'configured' => ! empty($value['api_key'] ?? config('services.mimo.api_key')),
        ];
    }

    public function setSystemConfig(string $apiKey, ?string $baseUrl = null): void
    {
        SystemSetting::putEncrypted(self::SYSTEM_KEY, [
            'base_url' => $baseUrl ?: config('services.mimo.base_url'),
            'api_key' => $apiKey,
        ]);
    }

    public function effectiveConfigFor(User $user): array
    {
        $userConfig = $user->apiConfig;
        if ($userConfig && $userConfig->enabled) {
            return [
                'source' => 'user',
                'base_url' => $userConfig->base_url ?: config('services.mimo.base_url'),
                'api_key' => $userConfig->api_key,
            ];
        }

        $system = $this->systemConfig();

        return [
            'source' => 'system',
            'base_url' => $system['base_url'],
            'api_key' => $system['api_key'],
        ];
    }

    public function publicSystemConfig(): array
    {
        $config = $this->systemConfig();

        return [
            'base_url' => $config['base_url'],
            'configured' => $config['configured'],
        ];
    }
}
