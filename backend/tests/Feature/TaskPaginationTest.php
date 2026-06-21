<?php

namespace Tests\Feature;

use App\Models\AudioJob;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaskPaginationTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_jobs_are_paginated_beyond_first_hundred_records(): void
    {
        $user = User::factory()->create();

        foreach (range(1, 105) as $index) {
            AudioJob::create([
                'user_id' => $user->id,
                'type' => 'tts',
                'model' => 'mimo-v2.5-tts',
                'status' => 'completed',
                'request_payload' => [
                    '_input' => ['title' => '任务 '.$index],
                ],
            ]);
        }

        $this->actingAs($user)
            ->getJson('/api/mimo/jobs?page=6&per_page=20')
            ->assertOk()
            ->assertJsonPath('pagination.total', 105)
            ->assertJsonPath('pagination.page', 6)
            ->assertJsonPath('pagination.pageCount', 6)
            ->assertJsonCount(5, 'tasks');
    }

    public function test_admin_jobs_can_filter_and_paginate_server_side(): void
    {
        $admin = User::factory()->admin()->create();
        $firstUser = User::factory()->create(['name' => '甲用户']);
        $secondUser = User::factory()->create(['name' => '乙用户']);

        AudioJob::create([
            'user_id' => $firstUser->id,
            'type' => 'asr',
            'model' => 'mimo-v2.5-asr',
            'status' => 'completed',
            'request_payload' => [
                '_input' => ['title' => '会议录音'],
            ],
        ]);
        AudioJob::create([
            'user_id' => $secondUser->id,
            'type' => 'tts',
            'model' => 'mimo-v2.5-tts',
            'status' => 'failed',
            'request_payload' => [
                '_input' => ['title' => '公告配音'],
            ],
        ]);

        $this->actingAs($admin)
            ->getJson('/api/admin/jobs?module=speech-recognition&status=completed&per_page=20')
            ->assertOk()
            ->assertJsonPath('pagination.total', 1)
            ->assertJsonPath('tasks.0.title', '会议录音')
            ->assertJsonPath('tasks.0.userId', (string) $firstUser->id)
            ->assertJsonCount(2, 'filters.users');
    }

    public function test_admin_job_search_uses_title_and_escapes_like_wildcards(): void
    {
        $admin = User::factory()->admin()->create();
        $user = User::factory()->create();

        AudioJob::create([
            'user_id' => $user->id,
            'type' => 'tts',
            'model' => 'mimo-v2.5-tts',
            'status' => 'completed',
            'request_payload' => [
                '_input' => ['title' => '100_% 精确标题'],
            ],
        ]);
        AudioJob::create([
            'user_id' => $user->id,
            'type' => 'tts',
            'model' => 'mimo-v2.5-tts',
            'status' => 'completed',
            'request_payload' => [
                '_input' => ['title' => '100XX 精确标题'],
            ],
        ]);

        $this->actingAs($admin)
            ->getJson('/api/admin/jobs?q=100_%25&per_page=20')
            ->assertOk()
            ->assertJsonPath('pagination.total', 1)
            ->assertJsonPath('tasks.0.title', '100_% 精确标题');
    }
}
