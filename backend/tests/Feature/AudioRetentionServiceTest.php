<?php

namespace Tests\Feature;

use App\Models\AudioFile;
use App\Models\AudioJob;
use App\Models\User;
use App\Services\AudioRetentionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AudioRetentionServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_retention_deletes_only_expired_audio_files(): void
    {
        Storage::fake('audio');

        $user = User::factory()->create();
        $expiredJob = AudioJob::create([
            'user_id' => $user->id,
            'type' => 'tts',
            'model' => 'mimo-v2.5-tts',
            'status' => 'completed',
            'completed_at' => now()->subDays(20),
        ]);
        $freshJob = AudioJob::create([
            'user_id' => $user->id,
            'type' => 'tts',
            'model' => 'mimo-v2.5-tts',
            'status' => 'completed',
            'completed_at' => now()->subDays(2),
        ]);

        Storage::disk('audio')->put('generated/expired.wav', 'expired');
        Storage::disk('audio')->put('generated/fresh.wav', 'fresh');

        $expiredFile = AudioFile::create([
            'audio_job_id' => $expiredJob->id,
            'user_id' => $user->id,
            'kind' => 'generated',
            'disk' => 'audio',
            'path' => 'generated/expired.wav',
            'original_name' => 'expired.wav',
            'mime_type' => 'audio/wav',
            'size' => 7,
        ]);
        $freshFile = AudioFile::create([
            'audio_job_id' => $freshJob->id,
            'user_id' => $user->id,
            'kind' => 'generated',
            'disk' => 'audio',
            'path' => 'generated/fresh.wav',
            'original_name' => 'fresh.wav',
            'mime_type' => 'audio/wav',
            'size' => 5,
        ]);

        $result = app(AudioRetentionService::class)->pruneExpired([
            'enabled' => true,
            'retention_days' => 15,
        ]);

        $this->assertSame(1, $result['affected_jobs']);
        $this->assertSame(1, $result['deleted_files']);
        $this->assertDatabaseHas('audio_jobs', ['id' => $expiredJob->id]);
        $this->assertDatabaseHas('audio_jobs', ['id' => $freshJob->id]);
        $this->assertDatabaseMissing('audio_files', ['id' => $expiredFile->id]);
        $this->assertDatabaseHas('audio_files', ['id' => $freshFile->id]);
        $this->assertSame(
            'retention',
            $expiredJob->fresh()->request_payload['_meta']['audio_files_pruned_reason'] ?? null
        );
        $this->assertSame(
            1,
            $expiredJob->fresh()->request_payload['_meta']['audio_files_pruned_count'] ?? null
        );
        Storage::disk('audio')->assertMissing('generated/expired.wav');
        Storage::disk('audio')->assertExists('generated/fresh.wav');
    }
}
