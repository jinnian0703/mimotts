<?php

namespace App\Http\Controllers;

use App\Models\AudioJob;
use App\Models\AuditLog;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\BillingConfigService;
use App\Services\QuotaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminOverviewController
{
    private const BASIC_INFO_KEY = 'basic_info';

    public function users(): JsonResponse
    {
        return response()->json([
            'users' => User::query()
                ->latest()
                ->get()
                ->map(fn (User $user) => [
                    'id' => (string) $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $user->is_admin ? 'admin' : 'user',
                    'status' => $user->status ?: 'active',
                    'planId' => $user->plan_id,
                    'quotaBalance' => (int) $user->quota_balance,
                    'emailVerifiedAt' => $user->email_verified_at ? $user->email_verified_at->toDateTimeString() : null,
                    'avatarUrl' => $user->avatar_url,
                    'linuxdoId' => $user->linuxdo_id,
                    'lastLoginAt' => $user->last_login_at ? $user->last_login_at->toDateTimeString() : null,
                    'createdAt' => $user->created_at ? $user->created_at->toDateTimeString() : null,
                ])
                ->values(),
        ]);
    }

    public function updateUser(Request $request, User $user, BillingConfigService $billing, QuotaService $quota): JsonResponse
    {
        $planIds = $this->planIds($billing);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'role' => ['required', Rule::in(['admin', 'user'])],
            'status' => ['required', Rule::in(['active', 'suspended'])],
            'plan_id' => ['nullable', 'string', 'max:64', Rule::in($planIds)],
            'quota_balance' => ['nullable', 'integer', 'min:0'],
        ]);

        if ($user->id === $request->user()->id && ($data['role'] !== 'admin' || $data['status'] === 'suspended')) {
            return response()->json([
                'error' => [
                    'code' => 'SelfProtection',
                    'message' => '不能暂停或降权当前账号',
                ],
            ], 422);
        }

        $email = $user->email;
        if (array_key_exists('email', $data)) {
            $email = $data['email'] ? Str::lower($data['email']) : null;
        }
        $emailChanged = $email !== $user->email;

        $originalBalance = (int) $user->quota_balance;

        $user->forceFill([
            'name' => $data['name'],
            'email' => $email,
            'email_verified_at' => $email ? ($emailChanged ? now() : $user->email_verified_at) : null,
            'is_admin' => $data['role'] === 'admin',
            'status' => $data['status'],
            'plan_id' => $data['plan_id'] ?? null,
        ])->save();

        if (array_key_exists('quota_balance', $data) && (int) $data['quota_balance'] !== $originalBalance) {
            $quota->adjustBalance($user, (int) $data['quota_balance'], '管理员调整', [
                'admin_user_id' => $request->user()->id,
            ]);
        }

        return response()->json([
            'user' => $this->serializeUser($user->fresh()),
        ]);
    }

    public function bulkUsers(Request $request, BillingConfigService $billing): JsonResponse
    {
        $planIds = $this->planIds($billing);
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer'],
            'action' => ['required', Rule::in(['activate', 'suspend', 'set_plan'])],
            'plan_id' => ['nullable', 'string', 'max:64', Rule::in($planIds)],
        ]);

        if ($data['action'] === 'set_plan' && empty($data['plan_id'])) {
            return response()->json([
                'error' => [
                    'code' => 'PlanRequired',
                    'message' => '请选择套餐',
                ],
            ], 422);
        }

        $query = User::query()->whereIn('id', $data['ids']);
        if ($data['action'] === 'activate') {
            $query->update(['status' => 'active']);
        } elseif ($data['action'] === 'suspend') {
            $query->where('id', '<>', $request->user()->id);
            $query->update(['status' => 'suspended']);
        } elseif ($data['action'] === 'set_plan') {
            $query->update(['plan_id' => $data['plan_id'] ?? null]);
        }

        return $this->users();
    }

    public function jobs(Request $request): JsonResponse
    {
        return response()->json([
            'tasks' => $this->jobQuery($request->user()->id)->get()->map(fn (AudioJob $job) => $this->serializeJob($job))->values(),
        ]);
    }

    public function allJobs(): JsonResponse
    {
        return response()->json([
            'tasks' => $this->jobQuery()->get()->map(fn (AudioJob $job) => $this->serializeJob($job))
                ->values(),
        ]);
    }

    public function audits(): JsonResponse
    {
        return response()->json([
            'audits' => AuditLog::query()
                ->with('user')
                ->latest()
                ->limit(100)
                ->get()
                ->map(fn (AuditLog $log) => [
                    'id' => (string) $log->id,
                    'actor' => $log->user ? $log->user->name : '系统',
                    'action' => $log->action,
                    'target' => trim(($log->resource_type ?? '').' '.($log->resource_id ?? '')),
                    'createdAt' => $log->created_at ? $log->created_at->toDateTimeString() : null,
                ])
                ->values(),
        ]);
    }

    public function settings(): JsonResponse
    {
        return response()->json([
            'settings' => SystemSetting::query()
                ->latest()
                ->get()
                ->map(fn (SystemSetting $setting) => [
                    'key' => $setting->key,
                    'value' => $setting->is_encrypted ? '[encrypted]' : json_encode($setting->value, JSON_UNESCAPED_UNICODE),
                    'updatedAt' => $setting->updated_at ? $setting->updated_at->toDateTimeString() : null,
                ])
                ->values(),
        ]);
    }

    public function basicInfo(): JsonResponse
    {
        return response()->json([
            'config' => $this->basicInfoConfig(),
        ]);
    }

    public function updateBasicInfo(Request $request): JsonResponse
    {
        $data = $request->validate([
            'system_name' => ['nullable', 'string', 'max:255'],
            'site_title' => ['nullable', 'string', 'max:255'],
            'site_subtitle' => ['nullable', 'string', 'max:255'],
            'app_url' => ['nullable', 'url', 'max:2048'],
            'frontend_url' => ['nullable', 'url', 'max:2048'],
            'icp_record' => ['nullable', 'string', 'max:255'],
            'footer_text' => ['nullable', 'string', 'max:1000'],
            'support_email' => ['nullable', 'email', 'max:255'],
        ]);

        $current = $this->basicInfoConfig();
        SystemSetting::putPlain(self::BASIC_INFO_KEY, [
            'system_name' => array_key_exists('system_name', $data) ? $data['system_name'] : $current['system_name'],
            'site_title' => array_key_exists('site_title', $data) ? $data['site_title'] : $current['site_title'],
            'site_subtitle' => array_key_exists('site_subtitle', $data) ? $data['site_subtitle'] : $current['site_subtitle'],
            'app_url' => array_key_exists('app_url', $data) ? $data['app_url'] : $current['app_url'],
            'frontend_url' => array_key_exists('frontend_url', $data) ? $data['frontend_url'] : $current['frontend_url'],
            'icp_record' => array_key_exists('icp_record', $data) ? $data['icp_record'] : $current['icp_record'],
            'footer_text' => array_key_exists('footer_text', $data) ? $data['footer_text'] : $current['footer_text'],
            'support_email' => array_key_exists('support_email', $data) ? $data['support_email'] : $current['support_email'],
        ]);

        return response()->json([
            'config' => $this->basicInfoConfig(),
        ]);
    }

    private function jobQuery(?int $userId = null)
    {
        return AudioJob::query()
            ->with(['files', 'user'])
            ->when($userId, fn ($query) => $query->where('user_id', $userId))
            ->latest()
            ->limit(100);
    }

    private function serializeUser(User $user): array
    {
        return [
            'id' => (string) $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->is_admin ? 'admin' : 'user',
            'status' => $user->status ?: 'active',
            'planId' => $user->plan_id,
            'quotaBalance' => (int) $user->quota_balance,
            'emailVerifiedAt' => $user->email_verified_at ? $user->email_verified_at->toDateTimeString() : null,
            'avatarUrl' => $user->avatar_url,
            'linuxdoId' => $user->linuxdo_id,
            'lastLoginAt' => $user->last_login_at ? $user->last_login_at->toDateTimeString() : null,
            'createdAt' => $user->created_at ? $user->created_at->toDateTimeString() : null,
        ];
    }

    private function planIds(BillingConfigService $billing): array
    {
        return array_values(array_filter(array_map(
            fn (array $plan) => (string) ($plan['id'] ?? ''),
            $billing->config()['plans'] ?? []
        )));
    }

    private function basicInfoConfig(): array
    {
        $setting = SystemSetting::query()->where('key', self::BASIC_INFO_KEY)->first();
        $value = $setting ? $setting->decodedValue() : [];

        return [
            'system_name' => $value['system_name'] ?? config('app.name'),
            'site_title' => $value['site_title'] ?? config('app.name'),
            'site_subtitle' => $value['site_subtitle'] ?? '',
            'app_url' => $value['app_url'] ?? config('app.url'),
            'frontend_url' => $value['frontend_url'] ?? config('app.frontend_url'),
            'icp_record' => $value['icp_record'] ?? '',
            'footer_text' => $value['footer_text'] ?? '',
            'support_email' => $value['support_email'] ?? config('mail.from.address'),
        ];
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
            'progress' => $job->status === 'completed' ? 100 : ($job->status === 'failed' ? 100 : 50),
            'createdAt' => $this->formatTaskTime($job->created_at),
            'startedAt' => $this->formatTaskTime($job->started_at),
            'completedAt' => $this->formatTaskTime($job->completed_at),
            'outputUrl' => $file ? '/mimo/files/'.$file->id : null,
            'summary' => $job->error_message ?: ($job->status === 'completed' ? '处理完成' : '等待处理'),
            'userId' => (string) $job->user_id,
            'userName' => $job->user ? $job->user->name : null,
            'userEmail' => $job->user ? $job->user->email : null,
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
}
