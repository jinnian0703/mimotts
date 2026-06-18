<?php

namespace App\Http\Controllers;

use App\Exceptions\InsufficientQuotaException;
use App\Models\AudioJob;
use App\Models\AudioFile;
use App\Models\QuotaLedgerEntry;
use App\Services\AudioStorageService;
use App\Services\AuditLogger;
use App\Services\AudioJobPayloadSummary;
use App\Services\AudioRetentionService;
use App\Services\BillingConfigService;
use App\Services\MimoClient;
use App\Services\MimoConfigService;
use App\Services\QuotaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Arr;
use RuntimeException;
use Throwable;

class MimoController
{
    public function asr(
        Request $request,
        MimoClient $client,
        MimoConfigService $configs,
        AudioStorageService $storage,
        AuditLogger $audit,
        BillingConfigService $billing,
        QuotaService $quota
    ): JsonResponse {
        $data = $request->validate([
            'audio' => ['required', 'file', 'mimes:mp3,mp4,m4a,wav,webm,ogg,flac', 'max:51200'],
            'prompt' => ['nullable', 'string', 'max:2000'],
            'language' => ['nullable', 'string', 'max:40'],
        ]);

        $job = $this->createJob($request, 'asr', 'mimo-v2.5-asr');
        $file = $storage->storeUpload($job, $data['audio'], 'source');
        $payload = $client->buildAsrPayload(
            base64_encode(file_get_contents($data['audio']->getRealPath())),
            $data['audio']->getMimeType() ?: 'audio/mpeg',
            $data['prompt'] ?? null
        );

        return $this->execute($request, $job, $payload, $configs, $client, $storage, $audit, $billing, $quota, 'mimo.asr', [
            'source_file_id' => $file->id,
        ]);
    }

    public function tts(
        Request $request,
        MimoClient $client,
        MimoConfigService $configs,
        AudioStorageService $storage,
        AuditLogger $audit,
        BillingConfigService $billing,
        QuotaService $quota
    ): JsonResponse {
        $data = $request->validate([
            'text' => ['required', 'string', 'max:10000'],
            'style_prompt' => ['nullable', 'string', 'max:2000'],
            'voice' => ['nullable', 'string', 'max:200'],
            'response_format' => ['nullable', 'in:mp3,wav,ogg,flac,pcm16'],
            'speech_rate' => ['nullable', 'in:x-slow,slow,normal,fast,x-fast'],
        ]);

        $job = $this->createJob($request, 'tts', 'mimo-v2.5-tts');
        $payload = $client->buildTtsPayload($data['text'], Arr::only($data, ['style_prompt', 'voice', 'response_format', 'speech_rate']));

        return $this->execute($request, $job, $payload, $configs, $client, $storage, $audit, $billing, $quota, 'mimo.tts');
    }

    public function voiceDesign(
        Request $request,
        MimoClient $client,
        MimoConfigService $configs,
        AudioStorageService $storage,
        AuditLogger $audit,
        BillingConfigService $billing,
        QuotaService $quota
    ): JsonResponse {
        $data = $request->validate([
            'description' => ['required', 'string', 'max:4000'],
            'text' => ['required', 'string', 'max:10000'],
            'response_format' => ['nullable', 'in:mp3,wav,ogg,flac,pcm16'],
            'optimize_text_preview' => ['nullable', 'boolean'],
            'speech_rate' => ['nullable', 'in:x-slow,slow,normal,fast,x-fast'],
        ]);

        $job = $this->createJob($request, 'voice_design', 'mimo-v2.5-tts-voicedesign');
        $payload = $client->buildVoiceDesignPayload(
            $data['description'],
            $data['text'],
            Arr::only($data, ['response_format', 'optimize_text_preview', 'speech_rate'])
        );

        return $this->execute($request, $job, $payload, $configs, $client, $storage, $audit, $billing, $quota, 'mimo.voice_design');
    }

    public function voiceClone(
        Request $request,
        MimoClient $client,
        MimoConfigService $configs,
        AudioStorageService $storage,
        AuditLogger $audit,
        BillingConfigService $billing,
        QuotaService $quota
    ): JsonResponse {
        $data = $request->validate([
            'audio' => ['required', 'file', 'mimes:mp3,mp4,m4a,wav,webm,ogg,flac', 'max:51200'],
            'text' => ['required', 'string', 'max:10000'],
            'label' => ['nullable', 'string', 'max:200'],
            'response_format' => ['nullable', 'in:mp3,wav,ogg,flac,pcm16'],
            'speech_rate' => ['nullable', 'in:x-slow,slow,normal,fast,x-fast'],
        ]);

        $job = $this->createJob($request, 'voice_clone', 'mimo-v2.5-tts-voiceclone');
        $file = $storage->storeUpload($job, $data['audio'], 'source');
        $payload = $client->buildVoiceClonePayload(
            base64_encode(file_get_contents($data['audio']->getRealPath())),
            $data['audio']->getMimeType() ?: 'audio/mpeg',
            $data['text'],
            $data['label'] ?? null,
            Arr::only($data, ['response_format', 'speech_rate'])
        );

        return $this->execute($request, $job, $payload, $configs, $client, $storage, $audit, $billing, $quota, 'mimo.voice_clone', [
            'source_file_id' => $file->id,
        ]);
    }

    public function job(Request $request, AudioJob $audioJob): JsonResponse
    {
        if ($audioJob->user_id !== $request->user()->id && ! $request->user()->is_admin) {
            return response()->json([
                'error' => [
                    'code' => 'Forbidden',
                    'message' => '当前账号无权查看该任务',
                ],
            ], 403);
        }

        return response()->json([
            'job' => $this->serializeJob($audioJob->load('files')),
        ]);
    }

    public function jobs(Request $request, AudioRetentionService $retention): JsonResponse
    {
        $retention->pruneOpportunistically();

        return response()->json([
            'tasks' => AudioJob::query()
                ->with('files')
                ->where('user_id', $request->user()->id)
                ->latest()
                ->limit(100)
                ->get()
                ->map(fn (AudioJob $job) => $this->serializeJob($job))
                ->values(),
        ]);
    }

    public function file(Request $request, AudioFile $audioFile)
    {
        if ($audioFile->user_id !== $request->user()->id && ! $request->user()->is_admin) {
            return response()->json([
                'error' => [
                    'code' => 'Forbidden',
                    'message' => '当前账号无权访问该文件',
                ],
            ], 403);
        }

        if (! Storage::disk($audioFile->disk)->exists($audioFile->path)) {
            return response()->json([
                'error' => [
                    'code' => 'FileNotFound',
                    'message' => '文件不存在',
                ],
            ], 404);
        }

        return Storage::disk($audioFile->disk)->download(
            $audioFile->path,
            $audioFile->original_name ?: basename($audioFile->path),
            ['Content-Type' => $audioFile->mime_type ?: 'application/octet-stream']
        );
    }

    public function destroy(Request $request, AudioJob $audioJob, AuditLogger $audit): JsonResponse
    {
        if ($audioJob->user_id !== $request->user()->id && ! $request->user()->is_admin) {
            return response()->json([
                'error' => [
                    'code' => 'Forbidden',
                    'message' => '当前账号无权删除该任务',
                ],
            ], 403);
        }

        $files = $audioJob->files()->get();

        foreach ($files as $file) {
            Storage::disk($file->disk)->delete($file->path);
        }

        $audit->record(
            $request,
            $request->user()->is_admin ? 'mimo.job.delete.admin' : 'mimo.job.delete',
            'audio_job',
            $audioJob->id,
            [
                'owner_user_id' => $audioJob->user_id,
                'file_count' => $files->count(),
            ]
        );

        $audioJob->delete();

        return response()->json(['ok' => true]);
    }

    public function bulkDestroy(Request $request, AuditLogger $audit): JsonResponse
    {
        if (! $request->user()->is_admin) {
            return response()->json([
                'error' => [
                    'code' => 'Forbidden',
                    'message' => '当前账号无权批量删除任务',
                ],
            ], 403);
        }

        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer'],
        ]);

        $jobs = AudioJob::query()
            ->with('files')
            ->whereIn('id', $data['ids'])
            ->get();

        foreach ($jobs as $job) {
            foreach ($job->files as $file) {
                Storage::disk($file->disk)->delete($file->path);
            }
        }

        $deletedIds = $jobs->pluck('id')->values()->all();
        AudioJob::query()->whereIn('id', $deletedIds)->delete();

        $audit->record($request, 'mimo.job.bulk_delete.admin', 'audio_job', null, [
            'ids' => $deletedIds,
            'count' => count($deletedIds),
        ]);

        return response()->json([
            'deleted_ids' => array_map('strval', $deletedIds),
        ]);
    }

    private function createJob(Request $request, string $type, string $model): AudioJob
    {
        return AudioJob::create([
            'user_id' => $request->user()->id,
            'type' => $type,
            'model' => $model,
            'status' => 'running',
            'started_at' => now(),
        ]);
    }

    private function execute(
        Request $request,
        AudioJob $job,
        array $payload,
        MimoConfigService $configs,
        MimoClient $client,
        AudioStorageService $storage,
        AuditLogger $audit,
        BillingConfigService $billing,
        QuotaService $quota,
        string $auditAction,
        array $extra = []
    ): JsonResponse {
        $consumeEntry = null;

        try {
            $effectiveConfig = $configs->effectiveConfigFor($request->user());
            $billingContext = $this->billingContextFor($effectiveConfig, $billing, $quota, $job->type);

            if ($billingContext['billable'] && $billingContext['quota_cost'] > 0) {
                $consumeEntry = $quota->consumeForJob(
                    $request->user(),
                    $job,
                    (int) $billingContext['quota_cost'],
                    $job->type,
                    '接口调用',
                    [
                        'model' => $job->model,
                        'audit_action' => $auditAction,
                    ]
                );
                $billingContext['quota_ledger_id'] = $consumeEntry ? (string) $consumeEntry->id : null;
            }

            $job->update([
                'request_payload' => $this->requestPayloadForStorage($payload, $billingContext),
            ]);

            $response = $client->chatCompletions($effectiveConfig, $payload);
            $generated = $storage->storeGeneratedFromResponse($job, $response, 'generated');

            $job->update([
                'status' => 'completed',
                'response_payload' => $response,
                'completed_at' => now(),
            ]);
            $audit->record($request, $auditAction, 'audio_job', $job->id, array_merge($extra, $billingContext));

            return response()->json([
                'job' => $this->serializeJob($job->fresh('files')),
                'result' => $response,
                'generated_file_id' => $generated ? $generated->id : null,
            ]);
        } catch (Throwable $e) {
            if ($consumeEntry instanceof QuotaLedgerEntry) {
                $quota->refundConsume($consumeEntry);
            }

            $job->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
                'completed_at' => now(),
            ]);

            if ($e instanceof InsufficientQuotaException) {
                return response()->json([
                    'error' => [
                        'code' => 'InsufficientQuota',
                        'message' => '可用额度不足',
                        'required' => $e->required(),
                        'balance' => $e->balance(),
                    ],
                ], 402);
            }

            throw $e instanceof RuntimeException ? $e : new RuntimeException('音频处理失败', 0, $e);
        }
    }

    private function billingContextFor(array $effectiveConfig, BillingConfigService $billing, QuotaService $quota, string $module): array
    {
        $source = ($effectiveConfig['source'] ?? 'system') === 'user' ? 'user' : 'system';
        $cost = $source === 'system' ? $quota->costFor($module, $billing->config()) : 0;

        return [
            'api_config_source' => $source,
            'billable' => $source === 'system',
            'quota_cost' => $cost,
            'quota_ledger_id' => null,
        ];
    }

    private function requestPayloadForStorage(array $payload, array $billingContext): array
    {
        return array_merge($this->redactedPayload($payload), [
            '_meta' => [
                'api_config_source' => $billingContext['api_config_source'],
                'billable' => $billingContext['billable'],
                'quota_cost' => $billingContext['quota_cost'],
                'quota_ledger_id' => $billingContext['quota_ledger_id'] ?? null,
            ],
        ]);
    }

    private function redactedPayload(array $payload): array
    {
        array_walk_recursive($payload, function (&$value, $key): void {
            if ($key === 'data' && is_string($value) && strlen($value) > 120) {
                $value = substr($value, 0, 40).'...'.substr($value, -20);
            }
        });

        return $payload;
    }

    private function serializeJob(AudioJob $job): array
    {
        $file = $job->files->firstWhere('kind', 'generated') ?? $job->files->first();
        $requestMeta = is_array($job->request_payload) ? ($job->request_payload['_meta'] ?? []) : [];

        return [
            'id' => (string) $job->id,
            'module' => $this->moduleForType($job->type),
            'title' => $job->model,
            'status' => $job->status,
            'progress' => $this->progressForStatus($job->status),
            'createdAt' => $this->formatTaskTime($job->created_at),
            'startedAt' => $this->formatTaskTime($job->started_at),
            'completedAt' => $this->formatTaskTime($job->completed_at),
            'outputUrl' => $file ? '/mimo/files/'.$file->id : null,
            'summary' => $job->error_message ?: ($job->status === 'completed' ? '处理完成' : '等待处理'),
            'errorMessage' => $job->error_message,
            'requestSummary' => app(AudioJobPayloadSummary::class)->forJob($job),
            'fileName' => $file ? ($file->original_name ?: basename($file->path)) : null,
            'fileMimeType' => $file ? $file->mime_type : null,
            'fileSize' => $file ? $file->size : null,
            'apiConfigSource' => $requestMeta['api_config_source'] ?? null,
            'billable' => $requestMeta['billable'] ?? null,
            'quotaCost' => $requestMeta['quota_cost'] ?? null,
            'quotaLedgerId' => $requestMeta['quota_ledger_id'] ?? null,
        ];
    }

    private function formatTaskTime($value): ?string
    {
        if (! $value) {
            return null;
        }

        return $value
            ->copy()
            ->timezone(config('app.task_timezone', 'Asia/Shanghai'))
            ->format('Y-m-d H:i:s');
    }

    private function moduleForType(string $type): string
    {
        switch ($type) {
            case 'asr':
                return 'speech-recognition';
            case 'tts':
                return 'speech-synthesis';
            case 'voice_design':
                return 'voice-design';
            case 'voice_clone':
                return 'voice-clone';
            default:
                return $type;
        }
    }

    private function progressForStatus(string $status): int
    {
        switch ($status) {
            case 'completed':
            case 'failed':
                return 100;
            case 'running':
                return 64;
            default:
                return 12;
        }
    }
}
