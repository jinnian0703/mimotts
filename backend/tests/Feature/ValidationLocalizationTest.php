<?php

namespace Tests\Feature;

use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ValidationLocalizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_validation_min_string_message_is_chinese(): void
    {
        $admin = User::factory()->admin()->create();
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
            'email_login_enabled' => true,
        ]);
        SystemSetting::putEncrypted('email_auth_config', [
            'enabled' => true,
            'registration_enabled' => true,
            'verification_required' => false,
        ]);

        $response = $this->postJson('/api/auth/email/register', [
            'name' => '测试用户',
            'email' => 'short-password@example.com',
            'password' => '123',
            'password_confirmation' => '123',
        ]);

        $response
            ->assertUnprocessable()
            ->assertJsonPath('error.message', '密码至少需要8个字符。')
            ->assertJsonPath('error.fields.password.0', '密码至少需要8个字符。');

        $this->assertStringNotContainsString('validation.min.string', $response->getContent());
    }
}
