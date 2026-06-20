<?php

namespace Tests\Feature;

use App\Models\SystemSetting;
use App\Models\User;
use App\Services\InstallService;
use App\Services\MimoConfigService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class DockerInstallCommandTest extends TestCase
{
    use RefreshDatabase;

    private array $environmentKeys = [
        'MIMO_DOCKER_SYNC_CONFIG',
        'EMAIL_LOGIN_ENABLED',
        'EMAIL_REGISTRATION_ENABLED',
        'LINUXDO_LOGIN_ENABLED',
        'LINUXDO_CLIENT_ID',
        'LINUXDO_CLIENT_SECRET',
        'LINUXDO_REDIRECT_URI',
        'MIMO_API_KEY',
        'MIMO_BASE_URL',
    ];

    protected function tearDown(): void
    {
        foreach ($this->environmentKeys as $key) {
            putenv($key);
        }

        parent::tearDown();
    }

    public function test_uninstalled_docker_deployment_syncs_environment_and_waits_for_installer(): void
    {
        putenv('EMAIL_LOGIN_ENABLED=false');
        putenv('EMAIL_REGISTRATION_ENABLED=false');
        putenv('LINUXDO_LOGIN_ENABLED=true');
        putenv('LINUXDO_CLIENT_ID=linuxdo-client');
        putenv('LINUXDO_CLIENT_SECRET=linuxdo-secret');
        putenv('LINUXDO_REDIRECT_URI=https://mimo.example.com/api/auth/linuxdo/callback');
        putenv('MIMO_API_KEY=mimo-secret');
        putenv('MIMO_BASE_URL=https://api.example.com/v1');

        $this->artisan('mimo:docker-install')
            ->expectsOutput('MimoTTS Docker 环境已准备，请打开站点安装页创建管理员账号。')
            ->assertExitCode(0);

        $this->assertSame(0, User::query()->where('is_admin', true)->count());
        $this->assertDatabaseMissing('system_settings', ['key' => 'installation']);

        $this->assertSame('mimo-secret', app(MimoConfigService::class)->systemConfig()['api_key']);

        $emailConfig = app(InstallService::class)->emailAuthConfig();
        $this->assertFalse($emailConfig['enabled']);
        $this->assertFalse($emailConfig['registration_enabled']);

        $linuxDoConfig = app(InstallService::class)->linuxDoConfigForUpdate();
        $this->assertTrue((bool) ($linuxDoConfig['enabled'] ?? false));
        $this->assertSame('linuxdo-client', $linuxDoConfig['client_id']);
        $this->assertSame('linuxdo-secret', $linuxDoConfig['client_secret']);
    }

    public function test_it_does_not_overwrite_existing_admin(): void
    {
        $admin = User::factory()->admin()->create([
            'email' => 'existing@example.com',
            'password' => Hash::make('kept-password'),
        ]);
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
            'source' => 'docker_env',
        ]);

        $this->artisan('mimo:docker-install')
            ->expectsOutput('MimoTTS Docker 已安装，跳过管理员创建。')
            ->assertExitCode(0);

        $this->assertSame(1, User::query()->where('is_admin', true)->count());
    }

    public function test_existing_install_syncs_config_only_when_enabled(): void
    {
        $admin = User::factory()->admin()->create();
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
            'source' => 'docker_env',
        ]);

        putenv('MIMO_DOCKER_SYNC_CONFIG=true');
        putenv('MIMO_API_KEY=updated-secret');
        putenv('MIMO_BASE_URL=https://api.updated.example/v1');

        $this->artisan('mimo:docker-install')
            ->expectsOutput('MimoTTS Docker 已安装，跳过管理员创建并同步启动配置。')
            ->assertExitCode(0);

        $this->assertSame('updated-secret', app(MimoConfigService::class)->systemConfig()['api_key']);
        $this->assertSame(1, User::query()->where('is_admin', true)->count());
    }
}
