<?php

namespace App\Services;

use App\Models\AudioFile;
use App\Models\AudioJob;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class AudioStorageService
{
    public function storeUpload(AudioJob $job, UploadedFile $file, string $kind): AudioFile
    {
        $path = $file->storeAs(
            'uploads/'.$job->user_id.'/'.$job->id,
            Str::uuid().'.'.$file->guessExtension(),
            'audio'
        );

        return AudioFile::create([
            'audio_job_id' => $job->id,
            'user_id' => $job->user_id,
            'kind' => $kind,
            'disk' => 'audio',
            'path' => $path,
            'original_name' => $file->getClientOriginalName(),
            'mime_type' => $file->getMimeType(),
            'size' => $file->getSize() ?: 0,
            'sha256' => hash_file('sha256', $file->getRealPath()),
        ]);
    }

    public function storeGeneratedFromResponse(AudioJob $job, array $response, string $kind): ?AudioFile
    {
        $audio = $this->extractAudio($response);
        if (! $audio) {
            return null;
        }

        $format = $audio['format'] ?: 'mp3';
        $bytes = base64_decode($audio['data'], true);
        if ($bytes === false) {
            return null;
        }

        $path = 'generated/'.$job->user_id.'/'.$job->id.'/'.Str::uuid().'.'.$format;
        Storage::disk('audio')->put($path, $bytes);

        return AudioFile::create([
            'audio_job_id' => $job->id,
            'user_id' => $job->user_id,
            'kind' => $kind,
            'disk' => 'audio',
            'path' => $path,
            'mime_type' => $this->mimeFromFormat($format),
            'size' => strlen($bytes),
            'sha256' => hash('sha256', $bytes),
            'metadata' => ['source' => 'mimo_response'],
        ]);
    }

    private function extractAudio(array $response): ?array
    {
        $candidates = [
            Arr::get($response, 'audio'),
            Arr::get($response, 'data.audio'),
            Arr::get($response, 'choices.0.message.audio'),
            Arr::get($response, 'choices.0.message.content.0.audio'),
        ];

        foreach ($candidates as $candidate) {
            if (is_array($candidate) && ! empty($candidate['data'])) {
                return [
                    'data' => $candidate['data'],
                    'format' => $candidate['format'] ?? $candidate['mime_type'] ?? null,
                ];
            }

            if (is_string($candidate) && $candidate !== '') {
                return ['data' => $candidate, 'format' => null];
            }
        }

        return null;
    }

    private function mimeFromFormat(string $format): string
    {
        switch (strtolower($format)) {
            case 'wav':
                return 'audio/wav';
            case 'ogg':
                return 'audio/ogg';
            case 'flac':
                return 'audio/flac';
            default:
                return 'audio/mpeg';
        }
    }
}
