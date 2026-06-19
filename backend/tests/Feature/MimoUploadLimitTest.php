<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
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
}
