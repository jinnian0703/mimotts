<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserPaginationTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_users_are_paginated_server_side(): void
    {
        $admin = User::factory()->admin()->create();

        foreach (range(1, 25) as $index) {
            User::factory()->create([
                'name' => '分页用户 '.$index,
                'email' => 'page-user-'.$index.'@example.com',
            ]);
        }

        $this->actingAs($admin)
            ->getJson('/api/admin/users?page=2&per_page=20')
            ->assertOk()
            ->assertJsonPath('pagination.total', 26)
            ->assertJsonPath('pagination.page', 2)
            ->assertJsonPath('pagination.pageCount', 2)
            ->assertJsonCount(6, 'users');
    }

    public function test_admin_users_can_filter_server_side(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->create([
            'name' => '目标用户',
            'email' => 'target@example.com',
            'email_verified_at' => now(),
            'linuxdo_id' => 'linuxdo-target',
            'status' => 'active',
            'plan_id' => 'starter',
        ]);
        User::factory()->create([
            'name' => '其他用户',
            'email' => 'other@example.com',
            'email_verified_at' => null,
            'linuxdo_id' => null,
            'status' => 'suspended',
            'plan_id' => null,
        ]);

        $this->actingAs($admin)
            ->getJson('/api/admin/users?q=基础版&role=user&status=active&plan_id=starter&email=verified&linuxdo=linked')
            ->assertOk()
            ->assertJsonPath('pagination.total', 1)
            ->assertJsonPath('users.0.name', '目标用户')
            ->assertJsonPath('users.0.planId', 'starter');
    }
}
