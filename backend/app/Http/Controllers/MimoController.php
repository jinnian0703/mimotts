<?php

namespace App\Http\Controllers;

use App\Jobs\ProcessAudioJob;
use App\Models\AudioJob;
use App\Models\AudioFile;
use App\Services\AudioStorageService;
use App\Services\AudioJobPayloadSummary;
use App\Services\AudioRetentionService;
use App\Services\AuditLogger;
use App\Services\MimoClient;
use App\Support\DisplayTime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Arr;

class MimoController
{
    private const ASR_AUDIO_MAX_KILOBYTES = 7168;
    private const ASR_AUDIO_MAX_MEGABYTES = 7;
    private const TASK_TITLE_MAX_LENGTH = 20;
    private const PAGE_SIZE_OPTIONS = [20, 50, 100];

    public function asr(
        Request $request,
        MimoClient $client,
        AudioStorageService $storage
    ): JsonResponse {
        $data = $request->validate([
            'audio' => ['required', 'file', 'mimes:mp3,mp4,m4a,wav,webm,ogg,flac', 'max:'.self::ASR_AUDIO_MAX_KILOBYTES],
            'title' => ['nullable', 'string', 'max:'.self::TASK_TITLE_MAX_LENGTH],
            'priority' => ['nullable', 'in:low,normal,high'],
            'prompt' => ['nullable', 'string', 'max:2000'],
            'language' => ['nullable', 'string', 'max:40'],
        ], [
            'audio.max' => '语音识别音频不能超过 '.self::ASR_AUDIO_MAX_MEGABYTES.' MB（Base64 编码后需小于 10 MB）。',
            'title.max' => '任务名称最多 '.self::TASK_TITLE_MAX_LENGTH.' 个字。',
        ]);

        $job = $this->createJob($request, 'asr', 'mimo-v2.5-asr');
        $file = $storage->storeUpload($job, $data['audio'], 'source');
        $payload = $client->buildAsrPayload(
            base64_encode((string) file_get_contents($data['audio']->getRealPath())),
            $client->normalizeAudioMimeType($data['audio']->getMimeType() ?: null, $data['audio']->getClientOriginalName()),
            $data['prompt'] ?? null,
            $data['language'] ?? null
        );

        return $this->queue($request, $job, $payload, [
            'title' => $data['title'] ?? null,
            'priority' => $data['priority'] ?? null,
            'prompt' => $data['prompt'] ?? null,
            'language' => $data['language'] ?? null,
        ], $file, 'mimo.asr', [
            'source_file_id' => $file->id,
        ]);
    }

    public function tts(
        Request $request,
        MimoClient $client,
        AudioStorageService $storage
    ): JsonResponse {
        $data = $request->validate([
            'title' => ['nullable', 'string', 'max:'.self::TASK_TITLE_MAX_LENGTH],
            'priority' => ['nullable', 'in:low,normal,high'],
            'text' => ['required', 'string', 'max:10000'],
            'style_prompt' => ['nullable', 'string', 'max:2000'],
            'voice' => ['nullable', 'string', 'max:200'],
            'response_format' => ['nullable', 'in:mp3,wav,ogg,flac,pcm16'],
            'speech_rate' => ['nullable', 'in:off,x-slow,slow,normal,fast,x-fast'],
            'delivery_mode' => ['nullable', 'in:speech,singing'],
        ], $this->titleValidationMessages());

        $job = $this->createJob($request, 'tts', 'mimo-v2.5-tts');
        $payload = $client->buildTtsPayload($data['text'], Arr::only($data, ['style_prompt', 'voice', 'response_format', 'speech_rate', 'delivery_mode']));

        return $this->queue($request, $job, $payload, Arr::only($data, ['title', 'priority', 'text', 'style_prompt', 'voice', 'response_format', 'speech_rate', 'delivery_mode']), null, 'mimo.tts');
    }

    public function voiceDesign(
        Request $request,
        MimoClient $client,
        AudioStorageService $storage
    ): JsonResponse {
        $data = $request->validate([
            'title' => ['nullable', 'string', 'max:'.self::TASK_TITLE_MAX_LENGTH],
            'priority' => ['nullable', 'in:low,normal,high'],
            'description' => ['required', 'string', 'max:4000'],
            'text' => ['required', 'string', 'max:10000'],
            'response_format' => ['nullable', 'in:mp3,wav,ogg,flac,pcm16'],
            'optimize_text_preview' => ['nullable', 'boolean'],
            'speech_rate' => ['nullable', 'in:off,x-slow,slow,normal,fast,x-fast'],
        ], $this->titleValidationMessages());

        $job = $this->createJob($request, 'voice_design', 'mimo-v2.5-tts-voicedesign');
        $payload = $client->buildVoiceDesignPayload(
            $data['description'],
            $data['text'],
            Arr::only($data, ['response_format', 'optimize_text_preview', 'speech_rate'])
        );

        return $this->queue($request, $job, $payload, Arr::only($data, ['title', 'priority', 'description', 'text', 'response_format', 'optimize_text_preview', 'speech_rate']), null, 'mimo.voice_design');
    }

    public function voiceClone(
        Request $request,
        MimoClient $client,
        AudioStorageService $storage
    ): JsonResponse {
        $data = $request->validate([
            'audio' => ['required', 'file', 'mimes:mp3,mp4,m4a,wav,webm,ogg,flac', 'max:51200'],
            'title' => ['nullable', 'string', 'max:'.self::TASK_TITLE_MAX_LENGTH],
            'priority' => ['nullable', 'in:low,normal,high'],
            'text' => ['required', 'string', 'max:10000'],
            'label' => ['nullable', 'string', 'max:200'],
            'response_format' => ['nullable', 'in:mp3,wav,ogg,flac,pcm16'],
            'speech_rate' => ['nullable', 'in:off,x-slow,slow,normal,fast,x-fast'],
            'sample_authorization_confirmed' => ['accepted'],
        ], array_merge($this->titleValidationMessages(), [
            'sample_authorization_confirmed.accepted' => '请确认拥有该声音样本的使用授权。',
        ]));

        $job = $this->createJob($request, 'voice_clone', 'mimo-v2.5-tts-voiceclone');
        $file = $storage->storeUpload($job, $data['audio'], 'source');
        $payload = $client->buildVoiceClonePayload(
            base64_encode((string) file_get_contents($data['audio']->getRealPath())),
            $client->normalizeAudioMimeType($data['audio']->getMimeType() ?: null, $data['audio']->getClientOriginalName()),
            $data['text'],
            $data['label'] ?? null,
            Arr::only($data, ['response_format', 'speech_rate'])
        );

        return $this->queue($request, $job, $payload, Arr::only($data, ['title', 'priority', 'text', 'label', 'response_format', 'speech_rate', 'sample_authorization_confirmed']), $file, 'mimo.voice_clone', [
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
        [$page, $perPage] = $this->paginationParams($request);
        $query = AudioJob::query()
            ->with('files')
            ->where('user_id', $request->user()->id)
            ->latest();

        return response()->json($this->paginateJobQuery($query, $page, $perPage));
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
            'status' => 'queued',
        ]);
    }

    private function titleValidationMessages(): array
    {
        return [
            'title.max' => '任务名称最多 '.self::TASK_TITLE_MAX_LENGTH.' 个字。',
        ];
    }

    private function queue(
        Request $request,
        AudioJob $job,
        array $payload,
        array $input,
        ?AudioFile $sourceFile,
        string $auditAction,
        array $extra = []
    ): JsonResponse {
        $job->update([
            'status' => 'queued',
            'request_payload' => array_merge($this->redactedPayload($payload), [
                '_input' => $input,
                '_source_file_id' => $sourceFile ? $sourceFile->id : null,
                '_audit' => [
                    'action' => $auditAction,
                    'ip_address' => $request->ip(),
                    'user_agent' => $request->userAgent(),
                    'extra' => $extra,
                ],
            ]),
            'error_message' => null,
            'started_at' => null,
            'completed_at' => null,
        ]);

        dispatch(new ProcessAudioJob($job->id))->afterResponse();

        return response()->json([
            'job' => $this->serializeJob($job->fresh('files')),
            'queued' => true,
        ]);
    }

    private function redactedPayload(array $payload): array
    {
        array_walk_recursive($payload, function (&$value, $key): void {
            if (($key === 'data' || $key === 'voice') && is_string($value) && strlen($value) > 120) {
                $value = substr($value, 0, 40).'...'.substr($value, -20);
            }
        });

        return $payload;
    }

    private function serializeJob(AudioJob $job): array
    {
        $generatedFile = $job->files->firstWhere('kind', 'generated');
        $file = $generatedFile ?? $job->files->first();
        $requestPayload = is_array($job->request_payload) ? $job->request_payload : [];
        $requestMeta = $requestPayload['_meta'] ?? [];
        $input = is_array($requestPayload['_input'] ?? null) ? $requestPayload['_input'] : [];
        $title = trim((string) ($input['title'] ?? ''));

        return [
            'id' => (string) $job->id,
            'module' => $this->moduleForType($job->type),
            'title' => $title !== '' ? $title : $job->model,
            'status' => $job->status,
            'progress' => $this->progressForStatus($job->status),
            'createdAt' => $this->formatTaskTime($job->created_at),
            'startedAt' => $this->formatTaskTime($job->started_at),
            'completedAt' => $this->formatTaskTime($job->completed_at),
            'outputUrl' => $generatedFile ? '/mimo/files/'.$generatedFile->id : null,
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

        return DisplayTime::format($value);
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

    private function paginationParams(Request $request): array
    {
        $page = max(1, (int) $request->query('page', 1));
        $perPage = (int) $request->query('per_page', self::PAGE_SIZE_OPTIONS[0]);

        if (! in_array($perPage, self::PAGE_SIZE_OPTIONS, true)) {
            $perPage = self::PAGE_SIZE_OPTIONS[0];
        }

        return [$page, $perPage];
    }

    private function paginateJobQuery($query, int $page, int $perPage): array
    {
        $total = (clone $query)->count();
        $pageCount = max(1, (int) ceil($total / $perPage));
        $safePage = min($page, $pageCount);

        return [
            'tasks' => (clone $query)
                ->forPage($safePage, $perPage)
                ->get()
                ->map(fn (AudioJob $job) => $this->serializeJob($job))
                ->values(),
            'pagination' => [
                'page' => $safePage,
                'perPage' => $perPage,
                'total' => $total,
                'pageCount' => $pageCount,
            ],
        ];
    }
}
