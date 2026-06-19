<?php

namespace Tests\Feature;

use App\Models\AudioJob;
use App\Models\User;
use App\Services\AudioJobProcessor;
use App\Services\MimoConfigService;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MimoBillingContextTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_api_config_runs_without_billing_context(): void
    {
        $this->fakeMimoResponse('https://personal.example.com/chat/completions');

        $user = User::factory()->create();
        $user->apiConfig()->create([
            'base_url' => 'https://personal.example.com',
            'api_key' => 'personal-key',
            'enabled' => true,
        ]);
        app(MimoConfigService::class)->setSystemConfig('system-key', 'https://system.example.com');

        $this->actingAs($user)
            ->postJson('/api/mimo/tts', [
                'text' => '测试文本',
                'response_format' => 'wav',
            ])
            ->assertOk()
            ->assertJsonPath('queued', true)
            ->assertJsonPath('job.status', 'queued');

        $job = AudioJob::query()->firstOrFail();
        app(AudioJobProcessor::class)->process($job);
        $payload = $job->fresh()->request_payload;
        $this->assertSame('user', $payload['_meta']['api_config_source']);
        $this->assertFalse($payload['_meta']['billable']);
    }

    public function test_system_api_config_keeps_billing_context(): void
    {
        $this->fakeMimoResponse('https://system.example.com/chat/completions');

        $user = User::factory()->create(['quota_balance' => 10]);
        app(MimoConfigService::class)->setSystemConfig('system-key', 'https://system.example.com');

        $this->actingAs($user)
            ->postJson('/api/mimo/tts', [
                'text' => '测试文本',
                'response_format' => 'wav',
            ])
            ->assertOk()
            ->assertJsonPath('queued', true)
            ->assertJsonPath('job.status', 'queued');

        $job = AudioJob::query()->firstOrFail();
        app(AudioJobProcessor::class)->process($job);
        $payload = $job->fresh()->request_payload;
        $this->assertSame('system', $payload['_meta']['api_config_source']);
        $this->assertTrue($payload['_meta']['billable']);
    }

    private function fakeMimoResponse(string $url): void
    {
        $http = new HttpFactory();
        $http->fake([
            $url => Http::response([
                'choices' => [[
                    'message' => [
                        'audio' => [
                            'data' => base64_encode('audio'),
                            'format' => 'wav',
                        ],
                    ],
                ]],
            ]),
        ]);

        $this->app->instance(HttpFactory::class, $http);
    }
}
