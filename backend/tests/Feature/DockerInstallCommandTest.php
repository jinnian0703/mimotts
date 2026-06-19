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
        'MIMO_ADMIN_NAME',
        'MIMO_ADMIN_EMAIL',
        'MIMO_ADMIN_PASSWORD',
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

    public function test_it_installs_docker_deployment_from_environment(): void
    {
        putenv('MIMO_ADMIN_NAME=Docker Owner');
        putenv('MIMO_ADMIN_EMAIL=owner@example.com');
        putenv('MIMO_ADMIN_PASSWORD=password123');
        putenv('EMAIL_LOGIN_ENABLED=false');
        putenv('EMAIL_REGISTRATION_ENABLED=false');
        putenv('LINUXDO_LOGIN_ENABLED=true');
        putenv('LINUXDO_CLIENT_ID=linuxdo-client');
        putenv('LINUXDO_CLIENT_SECRET=linuxdo-secret');
        putenv('LINUXDO_REDIRECT_URI=https://mimo.example.com/api/auth/linuxdo/callback');
        putenv('MIMO_API_KEY=mimo-secret');
        putenv('MIMO_BASE_URL=https://api.example.com/v1');

        $this->artisan('mimo:docker-install')
            ->expectsOutput('MimoTTS Docker 初始化完成。')
            ->expectsOutput('管理员账号：owner@example.com')
            ->expectsOutput('管理员密码：password123')
            ->assertExitCode(0);

        $admin = User::query()->where('email', 'owner@example.com')->firstOrFail();
        $this->assertTrue($admin->is_admin);
        $this->assertTrue(Hash::check('password123', (string) $admin->password));

        $installation = SystemSetting::query()->where('key', 'installation')->firstOrFail()->decodedValue();
        $this->assertSame('docker_env', $installation['source'] ?? null);
        $this->assertFalse((bool) ($installation['email_login_enabled'] ?? true));
        $this->assertTrue((bool) ($installation['linuxdo_configured'] ?? false));

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

        putenv('MIMO_ADMIN_EMAIL=new@example.com');
        putenv('MIMO_ADMIN_PASSWORD=new-password');

        $this->artisan('mimo:docker-install')
            ->expectsOutput('MimoTTS Docker 已安装，跳过管理员创建。')
            ->assertExitCode(0);

        $this->assertSame(1, User::query()->where('is_admin', true)->count());
        $this->assertDatabaseMissing('users', ['email' => 'new@example.com']);
        $this->assertTrue(Hash::check('kept-password', (string) $admin->fresh()->password));
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
