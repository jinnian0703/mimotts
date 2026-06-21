<?php

namespace Tests\Feature;

use App\Models\AudioJob;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class MimoVoiceCloneAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_voice_clone_requires_sample_authorization_confirmation(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->post('/api/mimo/voice-clone', [
                'audio' => UploadedFile::fake()->create('sample.wav', 128, 'audio/wav'),
                'title' => '声音克隆测试',
                'text' => '这是一段用于验证声音克隆的测试文本。',
                'label' => '授权样本',
                'response_format' => 'wav',
            ], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonPath('error.message', '请确认拥有该声音样本的使用授权。')
            ->assertJsonPath('error.fields.sample_authorization_confirmed.0', '请确认拥有该声音样本的使用授权。');

        $this->assertSame(0, AudioJob::query()->count());
    }
}
