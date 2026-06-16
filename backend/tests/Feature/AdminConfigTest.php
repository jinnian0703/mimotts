<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminConfigTest extends TestCase
{
    use RefreshDatabase;

    public function test_non_admin_cannot_update_system_mimo_config(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->putJson('/api/admin/mimo-config', ['api_key' => 'key'])
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'Forbidden');
    }

    public function test_admin_can_update_system_mimo_config_without_exposing_secret(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->putJson('/api/admin/mimo-config', [
                'api_key' => 'mimo-secret',
                'base_url' => 'https://api.xiaomimimo.com/v1',
            ])
            ->assertOk()
            ->assertJsonPath('config.configured', true)
            ->assertJsonMissing(['api_key' => 'mimo-secret']);
    }
}
