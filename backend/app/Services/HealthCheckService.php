<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Throwable;

class HealthCheckService
{
    public function report(): array
    {
        $checks = [
            'database' => $this->databaseCheck(),
            'storage' => $this->pathCheck('storage', storage_path()),
            'cache' => $this->pathCheck('cache', base_path('bootstrap/cache')),
            'audio_storage' => $this->pathCheck('audio_storage', storage_path('app/audio')),
            'app_key' => $this->appKeyCheck(),
            'app_url' => $this->urlCheck('app_url', config('app.url')),
            'frontend_url' => $this->urlCheck('frontend_url', config('app.frontend_url')),
            'mimo_api' => $this->mimoApiCheck(),
            'auth_method' => $this->authMethodCheck(),
        ];

        $critical = ['database', 'storage', 'cache', 'audio_storage', 'app_key'];
        $hasCriticalFailure = collect($critical)->contains(
            fn (string $key): bool => empty($checks[$key]['ok'])
        );
        $hasWarning = collect($checks)->contains(fn (array $check): bool => empty($check['ok']));

        return [
            'status' => $hasCriticalFailure ? 'error' : ($hasWarning ? 'degraded' : 'ok'),
            'checked_at' => now()->toISOString(),
            'build' => app(BuildInfoService::class)->info(),
            'checks' => $checks,
        ];
    }

    private function databaseCheck(): array
    {
        try {
            DB::select('select 1');

            return $this->ok('数据库连接正常');
        } catch (Throwable $e) {
            return $this->fail('数据库连接失败');
        }
    }

    private function pathCheck(string $name, string $path): array
    {
        if (! is_dir($path)) {
            return $this->fail($this->label($name).'目录不存在');
        }

        if (! is_writable($path)) {
            return $this->fail($this->label($name).'目录不可写');
        }

        return $this->ok($this->label($name).'目录可写');
    }

    private function appKeyCheck(): array
    {
        $key = (string) config('app.key');

        if ($key === '' || $key === 'base64:' || strpos($key, 'SomeRandomString') !== false) {
            return $this->fail('APP_KEY 未设置');
        }

        return $this->ok('APP_KEY 已设置');
    }

    private function urlCheck(string $name, ?string $value): array
    {
        if (! $value || ! filter_var($value, FILTER_VALIDATE_URL)) {
            return $this->fail($this->label($name).'未配置为有效 URL');
        }

        return $this->ok($this->label($name).'已配置');
    }

    private function mimoApiCheck(): array
    {
        try {
            $config = app(MimoConfigService::class)->systemConfig();
        } catch (Throwable $e) {
            return $this->fail('Mimo API 配置读取失败');
        }

        if (empty($config['base_url']) || empty($config['api_key'])) {
            return $this->fail('Mimo API 未完整配置');
        }

        return $this->ok('Mimo API 已配置');
    }

    private function authMethodCheck(): array
    {
        try {
            $install = app(InstallService::class);
            $email = $install->emailAuthConfig();
            $status = $install->status();
        } catch (Throwable $e) {
            return $this->fail('登录配置读取失败');
        }

        if (($email['enabled'] ?? false) || ($status['linuxdo_configured'] ?? false)) {
            return $this->ok('至少一种登录方式已启用');
        }

        return $this->fail('邮箱登录和 LinuxDo 均未配置');
    }

    private function ok(string $message): array
    {
        return [
            'ok' => true,
            'message' => $message,
        ];
    }

    private function fail(string $message): array
    {
        return [
            'ok' => false,
            'message' => $message,
        ];
    }

    private function label(string $name): string
    {
        return [
            'storage' => 'storage',
            'cache' => 'bootstrap/cache',
            'audio_storage' => '音频存储',
            'app_url' => '后端地址',
            'frontend_url' => '前端地址',
        ][$name] ?? $name;
    }
}
