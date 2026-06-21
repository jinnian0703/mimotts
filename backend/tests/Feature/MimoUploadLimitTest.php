<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\AudioJobProcessor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\Client\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MimoUploadLimitTest extends TestCase
{
    use RefreshDatabase;

    public function test_asr_rejects_audio_files_larger_than_documented_limit(): void
    {
        $user = User::factory()->create();
        $audio = UploadedFile::fake()->create('too-large.wav', 7169, 'audio/wav');

        $this->actingAs($user)
            ->postJson('/api/mimo/asr', [
                'audio' => $audio,
                'title' => '超限识别',
                'language' => 'zh-CN',
            ])
            ->assertStatus(422)
            ->assertJsonPath('error.fields.audio.0', '语音识别音频不能超过 7 MB（Base64 编码后需小于 10 MB）。');
    }

    public function test_asr_language_is_stored_and_sent_to_mimo_payload(): void
    {
        Storage::fake('audio');

        $http = new HttpFactory();
        $http->fake([
            'https://personal.example.com/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => 'hello world',
                    ],
                ]],
            ]),
        ]);
        $this->app->instance(HttpFactory::class, $http);

        $user = User::factory()->create();
        $user->apiConfig()->create([
            'base_url' => 'https://personal.example.com',
            'api_key' => 'personal-key',
            'enabled' => true,
        ]);
        $audio = UploadedFile::fake()->create('sample.wav', 1, 'audio/wav');

        $this->actingAs($user)
            ->postJson('/api/mimo/asr', [
                'audio' => $audio,
                'title' => '英文识别',
                'prompt' => 'Please transcribe this audio.',
                'language' => 'en-US',
            ])
            ->assertOk()
            ->assertJsonPath('queued', true)
            ->assertJsonPath('job.status', 'queued');

        $job = $user->audioJobs()->firstOrFail();
        $this->assertSame('en', $job->request_payload['asr_options']['language']);
        $this->assertSame('en-US', $job->request_payload['_input']['language']);

        app(AudioJobProcessor::class)->process($job);

        $http->assertSent(function (Request $request): bool {
            return $request->url() === 'https://personal.example.com/chat/completions'
                && $request['model'] === 'mimo-v2.5-asr'
                && $request['asr_options']['language'] === 'en';
        });

        $this->assertSame('en', $job->fresh()->request_payload['asr_options']['language']);
    }
}
