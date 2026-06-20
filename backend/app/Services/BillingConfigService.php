<?php

namespace App\Services;

use App\Models\SystemSetting;
use Throwable;

class BillingConfigService
{
    public const KEY = 'billing_config';

    public function config(): array
    {
        $stored = $this->storedConfig();
        $quota = app(QuotaService::class);

        return array_merge($this->defaults(), $stored, [
            'plans' => $this->plans($stored['plans'] ?? null),
            'usage_costs' => $quota->normalizeUsageCosts($stored['usage_costs'] ?? null),
            'checkin' => $quota->normalizeCheckinConfig($stored['checkin'] ?? null),
        ]);
    }

    public function publicConfig(): array
    {
        $config = $this->config();

        return [
            'enabled' => (bool) $config['enabled'],
            'provider' => 'linuxdo_credit',
            'provider_name' => 'LinuxDo Credit',
            'configured' => $this->configured($config),
            'default_plan_id' => $config['default_plan_id'],
            'credit_multiplier' => (float) $config['credit_multiplier'],
            'usage_costs' => $config['usage_costs'],
            'checkin' => [
                'enabled' => (bool) ($config['checkin']['enabled'] ?? false),
                'daily_quota' => (int) ($config['checkin']['daily_quota'] ?? 0),
            ],
            'plans' => array_map(fn (array $plan) => $this->publicPlan($plan, (float) $config['credit_multiplier']), $config['plans']),
        ];
    }

    public function adminConfig(): array
    {
        $config = $this->config();

        return array_merge($this->publicConfig(), [
            'gateway_url' => $config['gateway_url'],
            'client_id' => $config['client_id'],
            'client_secret_configured' => ! empty($config['client_secret']),
            'notify_url' => $config['notify_url'],
            'return_url' => $config['return_url'],
            'plans_revision' => (int) ($config['plans_revision'] ?? 1),
            'plans_history' => $config['plans_history'] ?? [],
            'plans_json' => json_encode($config['plans'], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
        ]);
    }

    public function save(array $data): array
    {
        $current = $this->config();
        $plans = $data['plans'] ?? $current['plans'];

        if (is_string($plans)) {
            $decoded = json_decode($plans, true);
            $plans = is_array($decoded) ? $decoded : $current['plans'];
        }
        $plans = $this->plans($plans);
        $plansRevision = (int) ($current['plans_revision'] ?? 1);
        $plansHistory = is_array($current['plans_history'] ?? null) ? $current['plans_history'] : [];
        $quota = app(QuotaService::class);
        $planIds = array_map(fn (array $plan) => (string) $plan['id'], $plans);
        $requestedDefaultPlanId = array_key_exists('default_plan_id', $data)
            ? $data['default_plan_id']
            : ($current['default_plan_id'] ?? null);
        $defaultPlanId = $requestedDefaultPlanId === null || $requestedDefaultPlanId === ''
            ? null
            : (string) $requestedDefaultPlanId;
        if ($defaultPlanId !== null && ! in_array($defaultPlanId, $planIds, true)) {
            $defaultPlanId = null;
        }

        $creditMultiplier = max(0.01, (float) ($data['credit_multiplier'] ?? $current['credit_multiplier']));
        if ($this->planFingerprint($plans, $creditMultiplier) !== $this->planFingerprint($current['plans'] ?? [], (float) ($current['credit_multiplier'] ?? 1))) {
            $plansHistory[] = [
                'revision' => $plansRevision,
                'changed_at' => now()->toISOString(),
                'credit_multiplier' => (float) ($current['credit_multiplier'] ?? 1),
                'plans' => $current['plans'] ?? [],
            ];
            $plansHistory = array_slice($plansHistory, -20);
            $plansRevision++;
        }

        $config = [
            'enabled' => (bool) ($data['enabled'] ?? $current['enabled']),
            'gateway_url' => rtrim((string) (($data['gateway_url'] ?? null) ?: $current['gateway_url']), '/'),
            'client_id' => $data['client_id'] ?? $current['client_id'],
            'client_secret' => ! empty($data['client_secret']) ? $data['client_secret'] : $current['client_secret'],
            'credit_multiplier' => $creditMultiplier,
            'default_plan_id' => $defaultPlanId,
            'notify_url' => $data['notify_url'] ?? null,
            'return_url' => $data['return_url'] ?? null,
            'usage_costs' => $quota->normalizeUsageCosts($data['usage_costs'] ?? $current['usage_costs']),
            'checkin' => $quota->normalizeCheckinConfig($data['checkin'] ?? $current['checkin']),
            'plans' => $plans,
            'plans_revision' => $plansRevision,
            'plans_history' => $plansHistory,
        ];

        SystemSetting::putEncrypted(self::KEY, $config);

        return $config;
    }

    public function plan(string $planId): ?array
    {
        foreach ($this->config()['plans'] as $plan) {
            if (($plan['id'] ?? '') === $planId && ($plan['enabled'] ?? true)) {
                return $plan;
            }
        }

        return null;
    }

    public function defaultPlan(): ?array
    {
        $config = $this->config();
        $defaultPlanId = (string) ($config['default_plan_id'] ?? '');

        if ($defaultPlanId === '') {
            return null;
        }

        foreach ($config['plans'] as $plan) {
            if ((string) ($plan['id'] ?? '') === $defaultPlanId) {
                return $plan;
            }
        }

        return null;
    }

    public function creditAmountForPlan(array $plan): string
    {
        $config = $this->config();

        return number_format((float) $plan['base_amount'] * (float) $config['credit_multiplier'], 2, '.', '');
    }

    private function defaults(): array
    {
        return [
            'enabled' => false,
            'gateway_url' => 'https://credit.linux.do/epay',
            'client_id' => '',
            'client_secret' => '',
            'credit_multiplier' => 1.0,
            'default_plan_id' => null,
            'notify_url' => null,
            'return_url' => null,
            'usage_costs' => [
                'asr' => 1,
                'tts' => 1,
                'voice_design' => 2,
                'voice_clone' => 3,
            ],
            'checkin' => [
                'enabled' => false,
                'daily_quota' => 10,
                'timezone' => config('app.task_timezone', 'Asia/Shanghai'),
            ],
            'plans' => [
                ['id' => 'starter', 'name' => '基础版', 'quota' => 100, 'base_amount' => 10, 'enabled' => true],
                ['id' => 'standard', 'name' => '标准版', 'quota' => 500, 'base_amount' => 45, 'enabled' => true],
                ['id' => 'business', 'name' => '企业版', 'quota' => 2000, 'base_amount' => 160, 'enabled' => true],
            ],
            'plans_revision' => 1,
            'plans_history' => [],
        ];
    }

    private function storedConfig(): array
    {
        try {
            $setting = SystemSetting::where('key', self::KEY)->first();
            $value = $setting ? $setting->decodedValue() : null;

            return is_array($value) ? $value : [];
        } catch (Throwable $e) {
            return [];
        }
    }

    private function plans($plans): array
    {
        if (! is_array($plans)) {
            return $this->defaults()['plans'];
        }

        $normalized = [];
        foreach ($plans as $plan) {
            if (! is_array($plan) || empty($plan['id']) || empty($plan['name'])) {
                continue;
            }

            $normalized[] = [
                'id' => (string) $plan['id'],
                'name' => (string) $plan['name'],
                'quota' => max(0, (int) ($plan['quota'] ?? 0)),
                'base_amount' => max(0.01, (float) ($plan['base_amount'] ?? 0.01)),
                'enabled' => (bool) ($plan['enabled'] ?? true),
            ];
        }

        return $normalized ?: $this->defaults()['plans'];
    }

    private function publicPlan(array $plan, float $multiplier): array
    {
        return [
            'id' => $plan['id'],
            'name' => $plan['name'],
            'quota' => $plan['quota'],
            'base_amount' => number_format((float) $plan['base_amount'], 2, '.', ''),
            'credit_amount' => number_format((float) $plan['base_amount'] * $multiplier, 2, '.', ''),
            'enabled' => (bool) $plan['enabled'],
        ];
    }

    private function configured(array $config): bool
    {
        return ! empty($config['client_id']) && ! empty($config['client_secret']);
    }

    private function planFingerprint(array $plans, float $multiplier): string
    {
        return md5(json_encode([
            'plans' => $this->plans($plans),
            'credit_multiplier' => $multiplier,
        ], JSON_UNESCAPED_UNICODE));
    }
}
