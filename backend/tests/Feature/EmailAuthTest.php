<?php

namespace Tests\Feature;

use App\Models\SystemSetting;
use App\Models\User;
use App\Services\BillingConfigService;
use App\Services\InstallService;
use App\Services\LinuxDoOAuthService;
use App\Services\QuotaService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class EmailAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_install_status_returns_email_login_state(): void
    {
        $admin = User::factory()->admin()->create();
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
        ]);
        app(InstallService::class)->setEmailAuthConfig([
            'enabled' => true,
            'smtp' => ['host' => 'smtp.example.com', 'port' => 587],
            'sender' => ['address' => 'noreply@example.com'],
        ]);

        $this->getJson('/api/install/status')
            ->assertOk()
            ->assertJsonPath('email_login_enabled', true)
            ->assertJsonPath('linuxdo_configured', false)
            ->assertJsonPath('email_auth.enabled', true)
            ->assertJsonPath('email_auth.smtp_configured', true)
            ->assertJsonPath('email_auth.sender_configured', true);
    }

    public function test_linuxdo_redirect_is_rejected_when_connect_is_not_configured(): void
    {
        config([
            'services.linuxdo.client_id' => null,
            'services.linuxdo.client_secret' => null,
        ]);

        $this->getJson('/api/auth/linuxdo/redirect')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'LinuxDoConnectDisabled');
    }

    public function test_email_register_is_rejected_when_email_login_is_disabled(): void
    {
        $admin = User::factory()->admin()->create();
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
        ]);
        app(InstallService::class)->setEmailAuthConfig(['enabled' => false]);

        $this->postJson('/api/auth/email/register', [
            'name' => 'Operator',
            'email' => 'operator@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'EmailLoginDisabled');
    }

    public function test_non_admin_email_login_is_rejected_when_email_login_is_disabled(): void
    {
        $admin = User::factory()->admin()->create();
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
        ]);
        app(InstallService::class)->setEmailAuthConfig(['enabled' => false]);

        User::factory()->create([
            'email' => 'operator@example.com',
            'password' => Hash::make('password123'),
            'email_verified_at' => now(),
        ]);

        $this->postJson('/api/auth/email/login', [
            'email' => 'operator@example.com',
            'password' => 'password123',
        ])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'EmailLoginDisabled');
    }

    public function test_admin_can_login_when_email_login_is_disabled(): void
    {
        $admin = User::factory()->admin()->create([
            'email' => 'admin@example.com',
            'password' => Hash::make('password123'),
            'email_verified_at' => now(),
        ]);
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
        ]);
        app(InstallService::class)->setEmailAuthConfig(['enabled' => false]);

        $this->postJson('/api/auth/email/login', [
            'email' => 'admin@example.com',
            'password' => 'password123',
        ])
            ->assertOk()
            ->assertJsonPath('user.email', 'admin@example.com')
            ->assertJsonPath('user.is_admin', true);
    }

    public function test_email_register_is_rejected_when_registration_is_disabled(): void
    {
        $admin = User::factory()->admin()->create();
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
        ]);
        app(InstallService::class)->setEmailAuthConfig([
            'enabled' => true,
            'registration_enabled' => false,
        ]);

        $this->postJson('/api/auth/email/register', [
            'name' => 'Operator',
            'email' => 'operator@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'RegistrationDisabled');

        $this->assertDatabaseMissing('users', [
            'email' => 'operator@example.com',
        ]);
    }

    public function test_user_can_register_and_login_with_email_when_enabled(): void
    {
        $admin = User::factory()->admin()->create();
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
        ]);
        app(InstallService::class)->setEmailAuthConfig(['enabled' => true]);

        $this->postJson('/api/auth/email/register', [
            'name' => 'Operator',
            'email' => 'operator@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])
            ->assertCreated()
            ->assertJsonPath('user.email', 'operator@example.com')
            ->assertJsonMissing(['password' => 'password123']);

        $this->postJson('/api/auth/logout')->assertOk();

        $this->postJson('/api/auth/email/login', [
            'email' => 'operator@example.com',
            'password' => 'password123',
        ])
            ->assertOk()
            ->assertJsonPath('user.email', 'operator@example.com');
    }

    public function test_email_registration_receives_default_plan_quota(): void
    {
        $admin = User::factory()->admin()->create();
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
        ]);
        app(InstallService::class)->setEmailAuthConfig(['enabled' => true]);
        app(BillingConfigService::class)->save([
            'default_plan_id' => 'standard',
            'plans' => [
                ['id' => 'starter', 'name' => '基础版', 'quota' => 100, 'base_amount' => 10, 'enabled' => true],
                ['id' => 'standard', 'name' => '标准版', 'quota' => 500, 'base_amount' => 45, 'enabled' => true],
            ],
        ]);

        $this->postJson('/api/auth/email/register', [
            'name' => 'Operator',
            'email' => 'operator@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])
            ->assertCreated()
            ->assertJsonPath('user.plan_id', 'standard')
            ->assertJsonPath('user.quota_balance', 500);

        $user = User::where('email', 'operator@example.com')->firstOrFail();
        $this->assertDatabaseHas('quota_ledger_entries', [
            'user_id' => $user->id,
            'type' => QuotaService::TYPE_GRANT,
            'amount' => 500,
            'balance_after' => 500,
            'description' => '默认套餐额度',
        ]);
    }

    public function test_linuxdo_new_user_receives_default_plan_quota(): void
    {
        app(BillingConfigService::class)->save([
            'default_plan_id' => 'business',
            'plans' => [
                ['id' => 'starter', 'name' => '基础版', 'quota' => 100, 'base_amount' => 10, 'enabled' => true],
                ['id' => 'business', 'name' => '企业版', 'quota' => 2000, 'base_amount' => 160, 'enabled' => true],
            ],
        ]);

        $user = app(LinuxDoOAuthService::class)->syncUser([
            'id' => 'linuxdo-user-1',
            'username' => 'LinuxDo User',
            'email' => 'linuxdo@example.com',
        ]);

        $this->assertSame('business', $user->plan_id);
        $this->assertSame(2000, (int) $user->quota_balance);
        $this->assertDatabaseHas('quota_ledger_entries', [
            'user_id' => $user->id,
            'type' => QuotaService::TYPE_GRANT,
            'amount' => 2000,
            'balance_after' => 2000,
            'description' => '默认套餐额度',
        ]);

        $user->forceFill(['quota_balance' => 123])->save();
        $syncedUser = app(LinuxDoOAuthService::class)->syncUser([
            'id' => 'linuxdo-user-1',
            'username' => 'LinuxDo User',
            'email' => 'linuxdo@example.com',
        ]);

        $this->assertSame(123, (int) $syncedUser->quota_balance);
    }

    public function test_email_login_requires_valid_credentials(): void
    {
        $admin = User::factory()->admin()->create();
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
        ]);
        app(InstallService::class)->setEmailAuthConfig(['enabled' => true]);

        User::factory()->create([
            'email' => 'operator@example.com',
            'password' => Hash::make('password123'),
        ]);

        $this->postJson('/api/auth/email/login', [
            'email' => 'operator@example.com',
            'password' => 'invalid-password',
        ])
            ->assertStatus(401)
            ->assertJsonPath('error.code', 'InvalidCredentials');
    }

    public function test_admin_can_update_email_auth_config(): void
    {
        $admin = User::factory()->admin()->create();
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
        ]);

        $this->actingAs($admin)
            ->putJson('/api/admin/email-auth-config', [
                'enabled' => true,
                'smtp_host' => 'smtp.example.com',
                'smtp_port' => 587,
                'smtp_username' => 'mailer',
                'smtp_password' => 'smtp-secret',
                'smtp_encryption' => 'tls',
                'mail_from_address' => 'noreply@example.com',
                'mail_from_name' => 'Mimo',
            ])
            ->assertOk()
            ->assertJsonPath('config.enabled', true)
            ->assertJsonPath('config.smtp.host', 'smtp.example.com')
            ->assertJsonPath('config.smtp.password_configured', true)
            ->assertJsonPath('config.sender.address', 'noreply@example.com')
            ->assertJsonMissing(['smtp-secret']);
    }

    public function test_admin_can_update_linuxdo_and_registration_config(): void
    {
        $admin = User::factory()->admin()->create();
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
        ]);

        $this->actingAs($admin)
            ->putJson('/api/admin/email-auth-config', [
                'enabled' => true,
                'registration_enabled' => false,
                'linuxdo_enabled' => true,
                'linuxdo_client_id' => 'linuxdo-client',
                'linuxdo_client_secret' => 'linuxdo-secret',
                'linuxdo_redirect_uri' => 'https://mimo.example.com/api/auth/linuxdo/callback',
            ])
            ->assertOk()
            ->assertJsonPath('config.enabled', true)
            ->assertJsonPath('config.registration_enabled', false)
            ->assertJsonPath('config.linuxdo.enabled', true)
            ->assertJsonPath('config.linuxdo.client_id', 'linuxdo-client')
            ->assertJsonPath('config.linuxdo.client_secret_configured', true)
            ->assertJsonPath('config.linuxdo.redirect_uri', 'https://mimo.example.com/api/auth/linuxdo/callback')
            ->assertJsonMissing(['linuxdo-secret']);

        $stored = SystemSetting::where('key', InstallService::LINUXDO_AUTH_KEY)->firstOrFail()->decodedValue();
        $this->assertSame('linuxdo-secret', $stored['client_secret'] ?? null);

        $this->actingAs($admin)
            ->putJson('/api/admin/email-auth-config', [
                'linuxdo_enabled' => false,
                'linuxdo_client_id' => 'linuxdo-client-2',
                'linuxdo_redirect_uri' => 'https://mimo.example.com/api/auth/linuxdo/callback',
            ])
            ->assertOk()
            ->assertJsonPath('config.linuxdo.enabled', false)
            ->assertJsonPath('config.linuxdo.client_id', 'linuxdo-client-2')
            ->assertJsonPath('config.linuxdo.client_secret_configured', true);

        $stored = SystemSetting::where('key', InstallService::LINUXDO_AUTH_KEY)->firstOrFail()->decodedValue();
        $this->assertSame('linuxdo-secret', $stored['client_secret'] ?? null);
    }

    public function test_linuxdo_new_user_is_rejected_when_registration_is_disabled(): void
    {
        $admin = User::factory()->admin()->create();
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
        ]);
        app(InstallService::class)->setEmailAuthConfig([
            'enabled' => true,
            'registration_enabled' => false,
        ]);
        $profile = [
            'id' => 'linuxdo-new-user',
            'username' => 'LinuxDo User',
            'email' => 'linuxdo-new@example.com',
        ];
        $oauth = \Mockery::mock(LinuxDoOAuthService::class);
        $oauth->shouldReceive('fetchUser')->once()->with('auth-code')->andReturn($profile);
        $oauth->shouldReceive('existingUser')->once()->with($profile)->andReturn(null);
        $oauth->shouldReceive('syncUser')->never();
        $this->app->instance(LinuxDoOAuthService::class, $oauth);

        $this->withSession(['linuxdo_oauth_state' => 'state-token'])
            ->getJson('/api/auth/linuxdo/callback?code=auth-code&state=state-token')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'RegistrationDisabled');

        $this->assertDatabaseMissing('users', [
            'linuxdo_id' => 'linuxdo-new-user',
        ]);
    }

    public function test_user_can_bind_linuxdo_account(): void
    {
        $user = User::factory()->create([
            'linuxdo_id' => null,
            'password' => Hash::make('password123'),
        ]);
        $profile = [
            'id' => 'linuxdo-bind-user',
            'username' => 'LinuxDo User',
            'avatar_url' => 'https://example.com/avatar.png',
        ];
        $oauth = \Mockery::mock(LinuxDoOAuthService::class);
        $oauth->shouldReceive('configured')->once()->andReturn(true);
        $oauth->shouldReceive('authorizationUrl')->once()->with(\Mockery::type('string'))->andReturn('https://connect.example.test/oauth');
        $oauth->shouldReceive('fetchUser')->once()->with('auth-code')->andReturn($profile);
        $oauth->shouldReceive('profileId')->once()->with($profile)->andReturn('linuxdo-bind-user');
        $this->app->instance(LinuxDoOAuthService::class, $oauth);

        $response = $this->actingAs($user)
            ->getJson('/api/account/linuxdo/redirect')
            ->assertOk()
            ->assertJsonPath('authorize_url', 'https://connect.example.test/oauth')
            ->assertSessionHas('linuxdo_oauth_mode', 'bind')
            ->assertSessionHas('linuxdo_oauth_user_id', $user->id);

        $sessionState = session('linuxdo_oauth_state');
        $this->assertNotEmpty($sessionState);

        $this->actingAs($user)
            ->withSession([
                'linuxdo_oauth_state' => $sessionState,
                'linuxdo_oauth_mode' => 'bind',
                'linuxdo_oauth_user_id' => $user->id,
            ])
            ->getJson('/api/auth/linuxdo/callback?code=auth-code&state='.$sessionState)
            ->assertOk()
            ->assertJsonPath('user.linuxdo_id', 'linuxdo-bind-user');

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'linuxdo_id' => 'linuxdo-bind-user',
        ]);
    }

    public function test_user_cannot_bind_linuxdo_account_used_by_another_user(): void
    {
        $user = User::factory()->create([
            'linuxdo_id' => null,
            'password' => Hash::make('password123'),
        ]);
        User::factory()->create([
            'linuxdo_id' => 'linuxdo-bound-user',
        ]);
        $profile = [
            'id' => 'linuxdo-bound-user',
            'username' => 'LinuxDo User',
        ];
        $oauth = \Mockery::mock(LinuxDoOAuthService::class);
        $oauth->shouldReceive('fetchUser')->once()->with('auth-code')->andReturn($profile);
        $oauth->shouldReceive('profileId')->once()->with($profile)->andReturn('linuxdo-bound-user');
        $this->app->instance(LinuxDoOAuthService::class, $oauth);

        $this->actingAs($user)
            ->withSession([
                'linuxdo_oauth_state' => 'state-token',
                'linuxdo_oauth_mode' => 'bind',
                'linuxdo_oauth_user_id' => $user->id,
            ])
            ->getJson('/api/auth/linuxdo/callback?code=auth-code&state=state-token')
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'LinuxDoAlreadyLinked');

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'linuxdo_id' => null,
        ]);
    }

    public function test_user_can_unlink_linuxdo_after_password_confirmation(): void
    {
        $user = User::factory()->create([
            'linuxdo_id' => 'linuxdo-user',
            'password' => Hash::make('password123'),
        ]);

        $this->actingAs($user)
            ->deleteJson('/api/account/linuxdo', [
                'current_password' => 'password123',
            ])
            ->assertOk()
            ->assertJsonPath('user.linuxdo_id', null);

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'linuxdo_id' => null,
        ]);
    }

    public function test_user_without_password_cannot_unlink_linuxdo(): void
    {
        $user = User::factory()->create([
            'linuxdo_id' => 'linuxdo-user',
            'password' => null,
        ]);

        $this->actingAs($user)
            ->deleteJson('/api/account/linuxdo')
            ->assertStatus(422)
            ->assertJsonPath('error.code', 'PasswordRequiredBeforeUnlink');
    }

    public function test_admin_can_send_email_auth_test_message(): void
    {
        $smtpConfig = [
            'driver' => 'smtp',
            'smtp' => [
                'host' => 'smtp.example.com',
                'port' => 465,
                'username' => 'mailer',
                'password' => 'saved-secret',
                'encryption' => 'ssl',
            ],
            'sender' => [
                'address' => 'noreply@example.com',
                'name' => 'Mimo',
            ],
        ];

        $this->assertNull(app(\App\Services\MailConfigService::class)->assertConfigured($smtpConfig));
        app(\App\Services\MailConfigService::class)->apply($smtpConfig);

        $this->assertSame('saved-secret', config('mail.mailers.smtp.password'));
        $this->assertSame('ssl', config('mail.mailers.smtp.encryption'));
    }

    public function test_admin_can_send_email_auth_test_message_by_api(): void
    {
        Http::fake([
            'https://mail.example.test/send' => Http::response(['sent' => true]),
        ]);

        $admin = User::factory()->admin()->create([
            'email' => 'admin@example.com',
        ]);
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
        ]);

        $this->actingAs($admin)
            ->postJson('/api/admin/email-auth-config/test', [
                'to' => 'receiver@example.com',
                'driver' => 'api',
                'mail_api_provider' => 'generic_json',
                'mail_api_endpoint' => 'https://mail.example.test/send',
                'mail_api_token' => 'api-secret',
                'mail_from_address' => 'noreply@example.com',
                'mail_from_name' => 'Mimo',
            ])
            ->assertOk()
            ->assertJsonPath('sent', true)
            ->assertJsonPath('message', '测试邮件已发送');

        Http::assertSent(function ($request): bool {
            return $request->url() === 'https://mail.example.test/send'
                && $request->hasHeader('Authorization', 'Bearer api-secret')
                && $request['from'] === 'noreply@example.com'
                && $request['from_name'] === 'Mimo'
                && $request['to'] === 'receiver@example.com'
                && $request['subject'] === '邮件投递测试';
        });
    }

    public function test_admin_can_send_email_auth_test_message_by_resend_without_from_name(): void
    {
        Http::fake([
            'https://mail.example.test/send' => Http::response(['sent' => true]),
        ]);

        $admin = User::factory()->admin()->create([
            'email' => 'admin@example.com',
        ]);
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
        ]);

        $this->actingAs($admin)
            ->postJson('/api/admin/email-auth-config/test', [
                'to' => 'receiver@example.com',
                'driver' => 'api',
                'mail_api_provider' => 'resend',
                'mail_api_endpoint' => 'https://mail.example.test/send',
                'mail_api_token' => 'api-secret',
                'mail_from_address' => 'noreply@example.com',
                'mail_from_name' => '',
            ])
            ->assertOk();

        Http::assertSent(function ($request): bool {
            return $request['from'] === 'noreply@example.com'
                && $request['to'] === ['receiver@example.com'];
        });
    }

    public function test_admin_can_send_email_auth_test_message_by_resend_with_from_name(): void
    {
        Http::fake([
            'https://mail.example.test/send' => Http::response(['sent' => true]),
        ]);

        $admin = User::factory()->admin()->create([
            'email' => 'admin@example.com',
        ]);
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
        ]);

        $this->actingAs($admin)
            ->postJson('/api/admin/email-auth-config/test', [
                'to' => 'receiver@example.com',
                'driver' => 'api',
                'mail_api_provider' => 'resend',
                'mail_api_endpoint' => 'https://mail.example.test/send',
                'mail_api_token' => 'api-secret',
                'mail_from_address' => 'noreply@example.com',
                'mail_from_name' => 'Mimo',
            ])
            ->assertOk();

        Http::assertSent(function ($request): bool {
            return $request['from'] === 'Mimo <noreply@example.com>'
                && $request['to'] === ['receiver@example.com'];
        });
    }
}
