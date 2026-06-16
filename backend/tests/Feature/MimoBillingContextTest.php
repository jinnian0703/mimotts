<?php

namespace Tests\Feature;

use App\Models\AudioJob;
use App\Models\User;
use App\Services\MimoConfigService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MimoBillingContextTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_api_config_runs_without_billing_context(): void
    {
        Http::fake([
            'https://personal.example.com/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'audio' => [
                            'data' => base64_encode('audio'),
                        ],
                    ],
                ]],
            ]),
        ]);

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
            ->assertJsonPath('job.apiConfigSource', 'user')
            ->assertJsonPath('job.billable', false);

        $payload = AudioJob::query()->firstOrFail()->request_payload;
        $this->assertSame('user', $payload['_meta']['api_config_source']);
        $this->assertFalse($payload['_meta']['billable']);
    }

    public function test_system_api_config_keeps_billing_context(): void
    {
        Http::fake([
            'https://system.example.com/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'audio' => [
                            'data' => base64_encode('audio'),
                        ],
                    ],
                ]],
            ]),
        ]);

        $user = User::factory()->create();
        app(MimoConfigService::class)->setSystemConfig('system-key', 'https://system.example.com');

        $this->actingAs($user)
            ->postJson('/api/mimo/tts', [
                'text' => '测试文本',
                'response_format' => 'wav',
            ])
            ->assertOk()
            ->assertJsonPath('job.apiConfigSource', 'system')
            ->assertJsonPath('job.billable', true);

        $payload = AudioJob::query()->firstOrFail()->request_payload;
        $this->assertSame('system', $payload['_meta']['api_config_source']);
        $this->assertTrue($payload['_meta']['billable']);
    }
}
