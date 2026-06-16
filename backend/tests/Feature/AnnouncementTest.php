<?php

namespace Tests\Feature;

use App\Models\Announcement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AnnouncementTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_receives_visible_active_announcements(): void
    {
        $user = User::factory()->create();
        $admin = User::factory()->admin()->create();

        Announcement::create([
            'title' => '系统维护',
            'content' => '今晚维护窗口。',
            'level' => 'warning',
            'audience' => 'all',
            'active' => true,
        ]);

        Announcement::create([
            'title' => '管理员公告',
            'content' => '仅管理员可见。',
            'level' => 'info',
            'audience' => 'admin',
            'active' => true,
        ]);

        Announcement::create([
            'title' => '已结束公告',
            'content' => '不应显示。',
            'level' => 'info',
            'audience' => 'all',
            'active' => true,
            'ends_at' => now()->subMinute(),
        ]);

        $this->actingAs($user)
            ->getJson('/api/announcements')
            ->assertOk()
            ->assertJsonCount(1, 'announcements')
            ->assertJsonPath('announcements.0.title', '系统维护');

        $this->actingAs($admin)
            ->getJson('/api/announcements')
            ->assertOk()
            ->assertJsonCount(2, 'announcements');
    }

    public function test_admin_can_create_update_and_delete_announcement(): void
    {
        $admin = User::factory()->admin()->create();

        $created = $this->actingAs($admin)
            ->postJson('/api/admin/announcements', [
                'title' => '版本更新',
                'content' => '已完成升级。',
                'level' => 'success',
                'audience' => 'all',
                'active' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('announcement.title', '版本更新')
            ->json('announcement');

        $this->actingAs($admin)
            ->putJson('/api/admin/announcements/'.$created['id'], [
                'title' => '版本更新通知',
                'content' => '已完成升级并恢复服务。',
                'level' => 'info',
                'audience' => 'user',
                'active' => false,
            ])
            ->assertOk()
            ->assertJsonPath('announcement.active', false)
            ->assertJsonPath('announcement.audience', 'user');

        $this->actingAs($admin)
            ->deleteJson('/api/admin/announcements/'.$created['id'])
            ->assertOk()
            ->assertJsonPath('ok', true);

        $this->assertDatabaseMissing('announcements', [
            'id' => (int) $created['id'],
        ]);
    }
}
