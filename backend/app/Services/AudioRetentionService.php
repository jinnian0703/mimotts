<?php

namespace App\Services;

use App\Models\AudioJob;
use App\Models\SystemSetting;
use App\Support\DisplayTime;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;

class AudioRetentionService
{
    public const KEY = 'audio_retention_config';

    private const DEFAULT_CONFIG = [
        'enabled' => false,
        'retention_days' => 30,
        'last_pruned_at' => null,
        'last_pruned_count' => 0,
    ];

    public function config(): array
    {
        $setting = SystemSetting::query()->where('key', self::KEY)->first();
        $value = $setting ? $setting->decodedValue() : [];

        return $this->normalizeConfig(is_array($value) ? $value : []);
    }

    public function save(array $data): array
    {
        $current = $this->config();
        $config = $this->normalizeConfig(array_merge($current, [
            'enabled' => array_key_exists('enabled', $data) ? (bool) $data['enabled'] : $current['enabled'],
            'retention_days' => array_key_exists('retention_days', $data) ? (int) $data['retention_days'] : $current['retention_days'],
        ]));

        SystemSetting::putPlain(self::KEY, $config);
        Cache::forget($this->opportunisticCacheKey());

        return $config;
    }

    public function pruneExpired(?array $config = null): array
    {
        $config = $this->normalizeConfig($config ?: $this->config());

        if (! $config['enabled']) {
            return [
                'enabled' => false,
                'affected_jobs' => 0,
                'deleted_files' => 0,
                'cutoff' => null,
            ];
        }

        $cutoff = Carbon::now()->subDays((int) $config['retention_days']);
        $affectedJobs = 0;
        $deletedFiles = 0;
        $prunedAt = DisplayTime::now();

        AudioJob::query()
            ->with('files')
            ->has('files')
            ->whereIn('status', ['completed', 'failed'])
            ->where(function ($query) use ($cutoff): void {
                $query
                    ->where(function ($inner) use ($cutoff): void {
                        $inner->whereNotNull('completed_at')->where('completed_at', '<', $cutoff);
                    })
                    ->orWhere(function ($inner) use ($cutoff): void {
                        $inner->whereNull('completed_at')->where('created_at', '<', $cutoff);
                    });
            })
            ->orderBy('id')
            ->chunkById(100, function ($jobs) use (&$affectedJobs, &$deletedFiles, $prunedAt): void {
                foreach ($jobs as $job) {
                    $jobDeletedFiles = 0;

                    foreach ($job->files as $file) {
                        Storage::disk($file->disk)->delete($file->path);
                        $file->delete();
                        $deletedFiles++;
                        $jobDeletedFiles++;
                    }

                    if ($jobDeletedFiles > 0) {
                        $requestPayload = is_array($job->request_payload) ? $job->request_payload : [];
                        $requestMeta = is_array($requestPayload['_meta'] ?? null) ? $requestPayload['_meta'] : [];
                        $requestPayload['_meta'] = array_merge($requestMeta, [
                            'audio_files_pruned_at' => $prunedAt,
                            'audio_files_pruned_count' => (($requestMeta['audio_files_pruned_count'] ?? 0) + $jobDeletedFiles),
                            'audio_files_pruned_reason' => 'retention',
                        ]);

                        $job->forceFill([
                            'request_payload' => $requestPayload,
                        ])->save();
                        $affectedJobs++;
                    }
                }
            });

        $config['last_pruned_at'] = $prunedAt;
        $config['last_pruned_count'] = $deletedFiles;
        SystemSetting::putPlain(self::KEY, $config);

        return [
            'enabled' => true,
            'affected_jobs' => $affectedJobs,
            'deleted_files' => $deletedFiles,
            'cutoff' => DisplayTime::format($cutoff),
        ];
    }

    public function pruneOpportunistically(): void
    {
        $config = $this->config();

        if (! $config['enabled']) {
            return;
        }

        $cacheKey = $this->opportunisticCacheKey();
        if (Cache::has($cacheKey)) {
            return;
        }

        Cache::put($cacheKey, true, now()->addHours(6));
        $this->pruneExpired($config);
    }

    private function normalizeConfig(array $config): array
    {
        $retentionDays = (int) ($config['retention_days'] ?? self::DEFAULT_CONFIG['retention_days']);

        return [
            'enabled' => (bool) ($config['enabled'] ?? self::DEFAULT_CONFIG['enabled']),
            'retention_days' => max(1, min(3650, $retentionDays)),
            'last_pruned_at' => $config['last_pruned_at'] ?? self::DEFAULT_CONFIG['last_pruned_at'],
            'last_pruned_count' => (int) ($config['last_pruned_count'] ?? self::DEFAULT_CONFIG['last_pruned_count']),
        ];
    }

    private function opportunisticCacheKey(): string
    {
        return self::KEY.':opportunistic:last_run';
    }
}
