<?php

namespace App\Services;

use App\Exceptions\InsufficientQuotaException;
use App\Models\AudioFile;
use App\Models\AudioJob;
use App\Models\AuditLog;
use App\Models\QuotaLedgerEntry;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

class AudioJobProcessor
{
    private MimoClient $client;
    private MimoConfigService $configs;
    private AudioStorageService $storage;
    private BillingConfigService $billing;
    private QuotaService $quota;

    public function __construct(
        MimoClient $client,
        MimoConfigService $configs,
        AudioStorageService $storage,
        BillingConfigService $billing,
        QuotaService $quota
    ) {
        $this->client = $client;
        $this->configs = $configs;
        $this->storage = $storage;
        $this->billing = $billing;
        $this->quota = $quota;
    }

    public function process(AudioJob $job): void
    {
        $job = $job->fresh(['files', 'user']);

        if (! $job || ! in_array($job->status, ['queued', 'running'], true)) {
            return;
        }

        $consumeEntry = null;

        try {
            $job->update([
                'status' => 'running',
                'started_at' => $job->started_at ?: now(),
                'error_message' => null,
            ]);

            $payload = $this->payloadForJob($job);
            $effectiveConfig = $this->configs->effectiveConfigFor($job->user);
            $billingContext = $this->billingContextFor($effectiveConfig, $job->type);

            if ($billingContext['billable'] && $billingContext['quota_cost'] > 0) {
                $consumeEntry = $this->quota->consumeForJob(
                    $job->user,
                    $job,
                    (int) $billingContext['quota_cost'],
                    $job->type,
                    '接口调用',
                    [
                        'model' => $job->model,
                        'audit_action' => $this->auditActionFor($job),
                    ]
                );
                $billingContext['quota_ledger_id'] = $consumeEntry ? (string) $consumeEntry->id : null;
            }

            $job->update([
                'request_payload' => $this->requestPayloadForStorage($job, $payload, $billingContext),
            ]);

            $response = $this->client->chatCompletions($effectiveConfig, $payload);
            $this->storage->storeGeneratedFromResponse($job, $response, 'generated');

            $job->update([
                'status' => 'completed',
                'response_payload' => $response,
                'completed_at' => now(),
            ]);

            $this->recordAudit($job, $this->auditActionFor($job), array_merge($this->auditExtraFor($job), $billingContext));
        } catch (Throwable $e) {
            if ($consumeEntry instanceof QuotaLedgerEntry) {
                $this->quota->refundConsume($consumeEntry);
            }

            $job->update([
                'status' => 'failed',
                'error_message' => $this->messageForException($e),
                'completed_at' => now(),
            ]);

            report($e);
        }
    }

    private function payloadForJob(AudioJob $job): array
    {
        $input = $this->inputForJob($job);

        switch ($job->type) {
            case 'asr':
                $file = $this->sourceFile($job);

                return $this->client->buildAsrPayload(
                    base64_encode($this->fileBytes($file)),
                    $this->client->normalizeAudioMimeType($file->mime_type, $file->original_name ?: $file->path),
                    Arr::get($input, 'prompt')
                );
            case 'tts':
                return $this->client->buildTtsPayload(
                    (string) Arr::get($input, 'text', ''),
                    Arr::only($input, ['style_prompt', 'voice', 'response_format', 'speech_rate', 'delivery_mode'])
                );
            case 'voice_design':
                return $this->client->buildVoiceDesignPayload(
                    (string) Arr::get($input, 'description', ''),
                    (string) Arr::get($input, 'text', ''),
                    Arr::only($input, ['response_format', 'optimize_text_preview', 'speech_rate'])
                );
            case 'voice_clone':
                $file = $this->sourceFile($job);

                return $this->client->buildVoiceClonePayload(
                    base64_encode($this->fileBytes($file)),
                    $this->client->normalizeAudioMimeType($file->mime_type, $file->original_name ?: $file->path),
                    (string) Arr::get($input, 'text', ''),
                    Arr::get($input, 'label'),
                    Arr::only($input, ['response_format', 'speech_rate'])
                );
            default:
                throw new RuntimeException('不支持的任务类型');
        }
    }

    private function inputForJob(AudioJob $job): array
    {
        $payload = is_array($job->request_payload) ? $job->request_payload : [];
        $input = Arr::get($payload, '_input', []);

        return is_array($input) ? $input : [];
    }

    private function sourceFile(AudioJob $job): AudioFile
    {
        $payload = is_array($job->request_payload) ? $job->request_payload : [];
        $sourceFileId = Arr::get($payload, '_source_file_id');
        $query = $job->files();

        if ($sourceFileId) {
            $query->whereKey($sourceFileId);
        } else {
            $query->where('kind', 'source');
        }

        $file = $query->first();
        if (! $file) {
            throw new RuntimeException('源文件不存在');
        }

        return $file;
    }

    private function fileBytes(AudioFile $file): string
    {
        if (! Storage::disk($file->disk)->exists($file->path)) {
            throw new RuntimeException('源文件不存在');
        }

        return Storage::disk($file->disk)->get($file->path);
    }

    private function billingContextFor(array $effectiveConfig, string $module): array
    {
        $source = ($effectiveConfig['source'] ?? 'system') === 'user' ? 'user' : 'system';
        $cost = $source === 'system' ? $this->quota->costFor($module, $this->billing->config()) : 0;

        return [
            'api_config_source' => $source,
            'billable' => $source === 'system',
            'quota_cost' => $cost,
            'quota_ledger_id' => null,
        ];
    }

    private function requestPayloadForStorage(AudioJob $job, array $payload, array $billingContext): array
    {
        $stored = is_array($job->request_payload) ? $job->request_payload : [];

        return array_merge($this->redactedPayload($payload), [
            '_input' => Arr::get($stored, '_input', []),
            '_source_file_id' => Arr::get($stored, '_source_file_id'),
            '_audit' => Arr::get($stored, '_audit', []),
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
            if (($key === 'data' || $key === 'voice') && is_string($value) && strlen($value) > 120) {
                $value = substr($value, 0, 40).'...'.substr($value, -20);
            }
        });

        return $payload;
    }

    private function auditActionFor(AudioJob $job): string
    {
        $payload = is_array($job->request_payload) ? $job->request_payload : [];
        $action = Arr::get($payload, '_audit.action');

        if (is_string($action) && $action !== '') {
            return $action;
        }

        switch ($job->type) {
            case 'asr':
                return 'mimo.asr';
            case 'tts':
                return 'mimo.tts';
            case 'voice_design':
                return 'mimo.voice_design';
            case 'voice_clone':
                return 'mimo.voice_clone';
            default:
                return 'mimo.task';
        }
    }

    private function auditExtraFor(AudioJob $job): array
    {
        $payload = is_array($job->request_payload) ? $job->request_payload : [];
        $extra = Arr::get($payload, '_audit.extra', []);

        return is_array($extra) ? $extra : [];
    }

    private function recordAudit(AudioJob $job, string $action, array $metadata): void
    {
        $payload = is_array($job->request_payload) ? $job->request_payload : [];

        try {
            AuditLog::create([
                'user_id' => $job->user_id,
                'action' => $action,
                'resource_type' => 'audio_job',
                'resource_id' => $job->id,
                'ip_address' => Arr::get($payload, '_audit.ip_address'),
                'user_agent' => Arr::get($payload, '_audit.user_agent'),
                'metadata' => $metadata,
            ]);
        } catch (Throwable $e) {
            report($e);
        }
    }

    private function messageForException(Throwable $e): string
    {
        if ($e instanceof InsufficientQuotaException) {
            return '可用额度不足';
        }

        return $e->getMessage() ?: '音频处理失败';
    }
}
