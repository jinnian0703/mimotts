<?php

namespace Tests\Feature;

use App\Models\SystemSetting;
use App\Models\User;
use App\Services\InstallService;
use App\Services\LinuxDoOAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccountDeletionTest extends TestCase
{
    use RefreshDatabase;

    public function test_account_deletion_marks_user_deleted_and_blocks_email_login(): void
    {
        $admin = User::factory()->admin()->create();
        $this->markInstalled($admin);

        $user = User::factory()->create([
            'name' => 'Deleted User',
            'email' => 'deleted@example.com',
            'password' => 'password123',
            'status' => User::STATUS_ACTIVE,
        ]);

        $this->actingAs($user)
            ->deleteJson('/api/account', [
                'current_password' => 'password123',
                'confirmation' => 'deleted@example.com',
            ])
            ->assertOk();

        $this->assertDatabaseHas('users', [
            'id' => $user->id,
            'email' => 'deleted@example.com',
            'status' => User::STATUS_DELETED,
        ]);

        $this->postJson('/api/auth/email/login', [
            'email' => 'deleted@example.com',
            'password' => 'password123',
        ])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'AccountDeleted')
            ->assertJsonPath('error.message', '账号已注销');

        $this->actingAs($admin)
            ->getJson('/api/admin/users?status=deleted')
            ->assertOk()
            ->assertJsonPath('pagination.total', 1)
            ->assertJsonPath('users.0.status', User::STATUS_DELETED);
    }

    public function test_deleted_linuxdo_account_cannot_login_again(): void
    {
        $user = User::factory()->create([
            'linuxdo_id' => 'linuxdo-deleted-user',
            'status' => User::STATUS_DELETED,
        ]);
        $profile = [
            'id' => 'linuxdo-deleted-user',
            'username' => 'Deleted LinuxDo User',
        ];

        $oauth = \Mockery::mock(LinuxDoOAuthService::class);
        $oauth->shouldReceive('fetchUser')->once()->with('auth-code', 'https://mimo.example.com/api/auth/linuxdo/callback')->andReturn($profile);
        $oauth->shouldReceive('syncUser')->once()->with($profile)->andReturn($user);
        $this->app->instance(LinuxDoOAuthService::class, $oauth);

        $this->withSession([
            'linuxdo_oauth_state' => 'state-token',
            'linuxdo_oauth_redirect_uri' => 'https://mimo.example.com/api/auth/linuxdo/callback',
            'linuxdo_oauth_frontend_url' => 'https://mimo.example.com',
        ])
            ->getJson('/api/auth/linuxdo/callback?code=auth-code&state=state-token')
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'AccountDeleted')
            ->assertJsonPath('error.message', '账号已注销');
    }

    private function markInstalled(User $admin): void
    {
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
        ]);
        app(InstallService::class)->setEmailAuthConfig(['enabled' => true]);
    }
}
