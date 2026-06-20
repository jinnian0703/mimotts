<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class AdminTimeDisplayTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_user_times_are_returned_in_china_time(): void
    {
        config([
            'app.timezone' => 'UTC',
            'app.display_timezone' => 'Asia/Shanghai',
            'app.task_timezone' => 'Asia/Shanghai',
        ]);

        $admin = User::factory()->admin()->create();
        $user = User::factory()->create([
            'last_login_at' => Carbon::parse('2026-06-20 12:34:56', 'UTC'),
            'created_at' => Carbon::parse('2026-06-20 01:02:03', 'UTC'),
            'updated_at' => Carbon::parse('2026-06-20 01:02:03', 'UTC'),
        ]);

        $response = $this->actingAs($admin)
            ->getJson('/api/admin/users')
            ->assertOk();

        $payload = collect($response->json('users'))
            ->firstWhere('id', (string) $user->id);

        $this->assertSame('2026-06-20 20:34:56', $payload['lastLoginAt']);
        $this->assertSame('2026-06-20 09:02:03', $payload['createdAt']);
    }
}
