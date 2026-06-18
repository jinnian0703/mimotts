<?php

namespace Tests\Feature;

use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class UpdateStatusTest extends TestCase
{
    use RefreshDatabase;

    public function test_update_status_reads_latest_manifest_without_github_api(): void
    {
        $admin = User::factory()->admin()->create();
        SystemSetting::putPlain('installation', [
            'installed_at' => now()->toISOString(),
            'admin_user_id' => $admin->id,
        ]);

        Http::fake([
            'https://github.com/jinnian0703/mimotts/releases/latest/download/latest.json' => Http::response([
                'version' => 'v1.0.0.0',
                'commit' => '9b7034a',
                'built_at' => '2026-06-18T20:06:38Z',
                'source_zip_url' => 'https://github.com/jinnian0703/mimotts/releases/download/v1.0.0.0/mimotts-source-upload.zip',
                'source_sha256' => 'hash',
                'docker_image' => 'ghcr.io/jinnian0703/mimotts:v1.0.0.0',
            ]),
            'https://api.github.com/*' => Http::response([], 429),
        ]);

        $this->actingAs($admin)
            ->getJson('/api/admin/update/status')
            ->assertOk()
            ->assertJsonPath('latest.ok', true)
            ->assertJsonPath('latest.version', 'v1.0.0.0')
            ->assertJsonPath('latest.manifest_url', 'https://github.com/jinnian0703/mimotts/releases/latest/download/latest.json');

        Http::assertNotSent(function ($request): bool {
            return str_starts_with($request->url(), 'https://api.github.com/');
        });
    }
}
