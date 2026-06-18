<?php

namespace Tests\Feature;

use App\Models\SystemSetting;
use App\Models\User;
use App\Services\InstallService;
use App\Services\MimoConfigService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HealthInstallStatusTest extends TestCase
{
    use RefreshDatabase;

    public function test_health_endpoint_reports_core_checks_and_build_info(): void
    {
        $admin = User::factory()->admin()->create();
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
        ]);
        app(MimoConfigService::class)->setSystemConfig('mimo-secret', 'https://api.example.com/v1');
        app(InstallService::class)->setEmailAuthConfig([
            'enabled' => true,
            'smtp' => ['host' => 'smtp.example.com', 'port' => 587],
            'sender' => ['address' => 'noreply@example.com'],
        ]);

        $this->getJson('/api/health')
            ->assertOk()
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('checks.database.ok', true)
            ->assertJsonPath('checks.storage.ok', true)
            ->assertJsonPath('checks.app_key.ok', true)
            ->assertJsonStructure([
                'build' => ['version', 'built_at', 'commit'],
            ]);
    }

    public function test_install_status_distinguishes_installed_missing_config(): void
    {
        $admin = User::factory()->admin()->create();
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
        ]);
        app(InstallService::class)->setEmailAuthConfig([
            'enabled' => true,
            'sender' => ['address' => null],
        ]);

        $this->getJson('/api/install/status')
            ->assertOk()
            ->assertJsonPath('installed', true)
            ->assertJsonPath('install_state', InstallService::STATE_INSTALLED_NEEDS_CONFIG)
            ->assertJsonFragment(['mimo_api'])
            ->assertJsonFragment(['email_sender']);
    }
}
