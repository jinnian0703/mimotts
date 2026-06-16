<?php

namespace Tests\Feature;

use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminBasicInfoTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_read_basic_info_defaults(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->getJson('/api/admin/basic-info')
            ->assertOk()
            ->assertJsonPath('config.system_name', config('app.name'))
            ->assertJsonPath('config.app_url', config('app.url'))
            ->assertJsonPath('config.frontend_url', config('app.frontend_url'));
    }

    public function test_admin_can_save_and_read_basic_info(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->putJson('/api/admin/basic-info', [
                'system_name' => 'Mimo Center',
                'site_title' => 'Mimo Portal',
                'site_subtitle' => 'A better voice hub',
                'app_url' => 'https://api.example.com',
                'frontend_url' => 'https://app.example.com',
                'icp_record' => '粤ICP备12345678号',
                'footer_text' => 'All rights reserved',
                'support_email' => 'support@example.com',
            ])
            ->assertOk()
            ->assertJsonPath('config.system_name', 'Mimo Center')
            ->assertJsonPath('config.support_email', 'support@example.com');

        $this->actingAs($admin)
            ->getJson('/api/admin/basic-info')
            ->assertOk()
            ->assertJsonPath('config.site_title', 'Mimo Portal')
            ->assertJsonPath('config.footer_text', 'All rights reserved');

        $setting = SystemSetting::where('key', 'basic_info')->first();
        $this->assertNotNull($setting);
        $stored = $setting ? $setting->decodedValue() : null;
        $this->assertSame('Mimo Center', $stored['system_name'] ?? null);
    }
}
