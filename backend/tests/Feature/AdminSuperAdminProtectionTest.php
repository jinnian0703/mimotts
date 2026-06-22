<?php

namespace Tests\Feature;

use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminSuperAdminProtectionTest extends TestCase
{
    use RefreshDatabase;

    public function test_delegated_admin_cannot_update_super_admin(): void
    {
        $superAdmin = User::factory()->admin()->create([
            'name' => '默认管理员',
            'email' => 'super@example.com',
            'status' => User::STATUS_ACTIVE,
        ]);
        $delegatedAdmin = User::factory()->admin()->create();
        $this->markSuperAdmin($superAdmin);

        $this->actingAs($delegatedAdmin)
            ->putJson('/api/admin/users/'.$superAdmin->id, [
                'name' => '被修改的管理员',
                'email' => 'super@example.com',
                'role' => 'user',
                'status' => User::STATUS_ACTIVE,
                'plan_id' => null,
            ])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'SuperAdminProtected');

        $this->assertDatabaseHas('users', [
            'id' => $superAdmin->id,
            'name' => '默认管理员',
            'is_admin' => true,
        ]);
    }

    public function test_delegated_admin_cannot_adjust_super_admin_quota(): void
    {
        $superAdmin = User::factory()->admin()->create(['quota_balance' => 10]);
        $delegatedAdmin = User::factory()->admin()->create();
        $this->markSuperAdmin($superAdmin);

        $this->actingAs($delegatedAdmin)
            ->postJson('/api/admin/users/'.$superAdmin->id.'/quota-adjustments', [
                'mode' => 'set',
                'amount' => 99,
                'reason' => '测试调整',
            ])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'SuperAdminProtected');

        $this->assertDatabaseHas('users', [
            'id' => $superAdmin->id,
            'quota_balance' => 10,
        ]);
    }

    public function test_delegated_admin_cannot_bulk_update_super_admin(): void
    {
        $superAdmin = User::factory()->admin()->create([
            'status' => User::STATUS_ACTIVE,
        ]);
        $delegatedAdmin = User::factory()->admin()->create();
        $this->markSuperAdmin($superAdmin);

        $this->actingAs($delegatedAdmin)
            ->postJson('/api/admin/users/bulk', [
                'ids' => [$superAdmin->id],
                'action' => 'suspend',
            ])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'SuperAdminProtected');

        $this->assertDatabaseHas('users', [
            'id' => $superAdmin->id,
            'status' => User::STATUS_ACTIVE,
        ]);
    }

    public function test_super_admin_can_update_delegated_admin(): void
    {
        $superAdmin = User::factory()->admin()->create();
        $delegatedAdmin = User::factory()->admin()->create([
            'name' => '普通管理员',
            'email' => 'delegated@example.com',
        ]);
        $this->markSuperAdmin($superAdmin);

        $this->actingAs($superAdmin)
            ->putJson('/api/admin/users/'.$delegatedAdmin->id, [
                'name' => '普通用户',
                'email' => 'delegated@example.com',
                'role' => 'user',
                'status' => User::STATUS_ACTIVE,
                'plan_id' => null,
            ])
            ->assertOk()
            ->assertJsonPath('user.role', 'user');

        $this->assertDatabaseHas('users', [
            'id' => $delegatedAdmin->id,
            'name' => '普通用户',
            'is_admin' => false,
        ]);
    }

    public function test_user_list_marks_super_admin(): void
    {
        $superAdmin = User::factory()->admin()->create([
            'name' => '默认管理员',
        ]);
        $this->markSuperAdmin($superAdmin);

        $this->actingAs($superAdmin)
            ->getJson('/api/admin/users?q=默认管理员')
            ->assertOk()
            ->assertJsonPath('users.0.isSuperAdmin', true)
            ->assertJsonPath('users.0.is_super_admin', true);
    }

    private function markSuperAdmin(User $user): void
    {
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $user->id,
        ]);
    }
}
