<?php

namespace App\Http\Controllers;

use App\Models\AudioJob;
use App\Models\AuditLog;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\AccountDeletionService;
use App\Services\AuditLogger;
use App\Services\AudioJobPayloadSummary;
use App\Services\AudioRetentionService;
use App\Services\BuildInfoService;
use App\Services\BillingConfigService;
use App\Services\InstallService;
use App\Services\MimoConfigService;
use App\Services\QuotaService;
use App\Support\DisplayTime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use RuntimeException;

class AdminOverviewController
{
    private const BASIC_INFO_KEY = 'basic_info';
    private const PAGE_SIZE_OPTIONS = [20, 50, 100];

    public function dashboard(
        Request $request,
        BillingConfigService $billing,
        InstallService $install,
        MimoConfigService $mimo
    ): JsonResponse {
        $user = $request->user();
        $isAdmin = (bool) $user->is_admin;
        $taskQuery = AudioJob::query()
            ->when(! $isAdmin, fn ($query) => $query->where('user_id', $user->id));

        return response()->json([
            'dashboard' => [
                'tasks' => [
                    'items' => (clone $taskQuery)
                        ->with(['files', 'user'])
                        ->latest()
                        ->limit(8)
                        ->get()
                        ->map(fn (AudioJob $job) => $this->serializeJob($job))
                        ->values(),
                    'stats' => $this->taskStats(clone $taskQuery),
                ],
                'billing' => $billing->publicConfig(),
                'users' => $isAdmin ? $this->userStats() : null,
                'mimo' => $isAdmin ? $mimo->publicSystemConfig() : null,
                'email' => $isAdmin ? $this->dashboardEmailConfig($install->emailAuthConfig()) : null,
                'settings' => $isAdmin ? ['total' => SystemSetting::query()->count()] : null,
                'updated_at' => DisplayTime::now(),
            ],
        ]);
    }

    public function users(Request $request, BillingConfigService $billing): JsonResponse
    {
        [$page, $perPage] = $this->paginationParams($request);
        $query = User::query()->latest();
        $this->applyUserFilters($query, $request, $billing);

        return response()->json($this->paginateUserQuery($query, $page, $perPage));
    }

    public function updateUser(
        Request $request,
        User $user,
        BillingConfigService $billing,
        QuotaService $quota,
        AccountDeletionService $deletion
    ): JsonResponse
    {
        if (! $this->canManageUser($request->user(), $user)) {
            return $this->superAdminProtectedResponse();
        }

        $planIds = $this->planIds($billing);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'role' => ['required', Rule::in(['admin', 'user'])],
            'status' => ['required', Rule::in([User::STATUS_ACTIVE, User::STATUS_SUSPENDED, User::STATUS_DELETED])],
            'plan_id' => ['nullable', 'string', 'max:64', Rule::in($planIds)],
            'quota_balance' => ['nullable', 'integer', 'min:0'],
            'quota_adjustment_reason' => ['required_with:quota_balance', 'nullable', 'string', 'max:255'],
        ]);

        if ($user->id === $request->user()->id && ($data['role'] !== 'admin' || $data['status'] !== User::STATUS_ACTIVE)) {
            return response()->json([
                'error' => [
                    'code' => 'SelfProtection',
                    'message' => '不能暂停或降权当前账号',
                ],
            ], 422);
        }

        if ($user->isDeleted()) {
            return response()->json([
                'error' => [
                    'code' => 'AccountDeleted',
                    'message' => '已注销账号不能编辑',
                ],
            ], 422);
        }

        if ($data['status'] === User::STATUS_DELETED) {
            if ($user->is_admin && User::query()->where('is_admin', true)->activeStatus()->count() <= 1) {
                return response()->json([
                    'error' => [
                        'code' => 'LastAdminAccount',
                        'message' => '最后一个管理员账号不能注销',
                    ],
                ], 422);
            }

            $deletion->markDeleted($user);

            return response()->json([
                'user' => $this->serializeUser($user->fresh()),
            ]);
        }

        $email = $user->email;
        if (array_key_exists('email', $data)) {
            $email = $data['email'] ? Str::lower($data['email']) : null;
        }
        $emailChanged = $email !== $user->email;

        $originalBalance = (int) $user->quota_balance;
        $originalPlanId = $user->plan_id;
        $nextPlanId = $data['plan_id'] ?? null;

        $user->forceFill([
            'name' => $data['name'],
            'email' => $email,
            'email_verified_at' => $email ? ($emailChanged ? now() : $user->email_verified_at) : null,
            'is_admin' => $data['role'] === 'admin',
            'status' => $data['status'],
            'plan_id' => $nextPlanId,
        ])->save();

        if (array_key_exists('quota_balance', $data) && (int) $data['quota_balance'] !== $originalBalance) {
            $quota->adjustBalance($user, (int) $data['quota_balance'], $data['quota_adjustment_reason'] ?: '管理员调整', [
                'admin_user_id' => $request->user()->id,
                'adjustment_mode' => 'set',
                'legacy_endpoint' => true,
            ]);
        } elseif ($nextPlanId && $nextPlanId !== $originalPlanId) {
            $plan = $this->planById($billing, $nextPlanId);
            if ($plan) {
                $this->grantUserPlanQuota($user, $plan, $quota, $request->user()->id);
            }
        }

        return response()->json([
            'user' => $this->serializeUser($user->fresh()),
        ]);
    }

    public function adjustQuota(Request $request, User $user, QuotaService $quota, AuditLogger $audit): JsonResponse
    {
        if (! $this->canManageUser($request->user(), $user)) {
            return $this->superAdminProtectedResponse();
        }

        if ($user->isDeleted()) {
            return response()->json([
                'error' => [
                    'code' => 'AccountDeleted',
                    'message' => '已注销账号不能调整额度',
                ],
            ], 422);
        }

        $data = $request->validate([
            'mode' => ['required', Rule::in(['add', 'subtract', 'set'])],
            'amount' => ['required', 'integer', 'min:0'],
            'reason' => ['required', 'string', 'max:255'],
        ]);

        $amount = (int) $data['amount'];
        if ($data['mode'] !== 'set' && $amount <= 0) {
            return response()->json([
                'error' => [
                    'code' => 'InvalidQuotaAdjustment',
                    'message' => '加减额度必须大于 0',
                ],
            ], 422);
        }

        $metadata = [
            'admin_user_id' => $request->user()->id,
            'target_user_id' => $user->id,
            'adjustment_mode' => $data['mode'],
        ];

        try {
            if ($data['mode'] === 'set') {
                $entry = $quota->adjustBalance($user, $amount, $data['reason'], $metadata);
            } else {
                $entry = $quota->adjustByDelta(
                    $user,
                    $data['mode'] === 'add' ? $amount : -$amount,
                    $data['reason'],
                    $metadata
                );
            }
        } catch (RuntimeException $e) {
            return response()->json([
                'error' => [
                    'code' => 'InvalidQuotaAdjustment',
                    'message' => $e->getMessage(),
                ],
            ], 422);
        }

        $audit->record($request, 'quota.adjust.admin', 'user', $user->id, [
            'mode' => $data['mode'],
            'amount' => $amount,
            'reason' => $data['reason'],
            'ledger_entry_id' => $entry ? $entry->id : null,
        ]);

        return response()->json([
            'user' => $this->serializeUser($user->fresh()),
            'entry' => $entry ? $quota->serializeEntry($entry) : null,
        ]);
    }

    public function removeDeletedUser(
        Request $request,
        User $user,
        AccountDeletionService $deletion,
        AuditLogger $audit
    ): JsonResponse {
        if (! $this->canManageUser($request->user(), $user)) {
            return $this->superAdminProtectedResponse();
        }

        if (! $user->isDeleted()) {
            return response()->json([
                'error' => [
                    'code' => 'AccountNotDeleted',
                    'message' => '只能移除已注销账号',
                ],
            ], 422);
        }

        $deletedId = (string) $user->id;

        $audit->record($request, 'account.remove_deleted.admin', 'user', $user->id, [
            'target_email' => $user->email,
            'target_name' => $user->name,
        ]);
        $deletion->markDeleted($user);
        $user->delete();

        return response()->json([
            'removed_id' => $deletedId,
        ]);
    }

    public function bulkUsers(Request $request, BillingConfigService $billing, QuotaService $quota): JsonResponse
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

        $targets = User::query()->whereIn('id', $data['ids'])->get();
        if ($targets->contains(fn (User $target) => ! $this->canManageUser($request->user(), $target))) {
            return $this->superAdminProtectedResponse();
        }

        $query = User::query()->whereIn('id', $targets->pluck('id')->all());
        if ($data['action'] === 'activate') {
            $query->notDeleted();
            $query->update(['status' => User::STATUS_ACTIVE]);
        } elseif ($data['action'] === 'suspend') {
            $query->where('id', '<>', $request->user()->id);
            $query->notDeleted();
            $query->update(['status' => User::STATUS_SUSPENDED]);
        } elseif ($data['action'] === 'set_plan') {
            $plan = $this->planById($billing, $data['plan_id'] ?? null);
            if (! $plan) {
                return response()->json([
                    'error' => [
                        'code' => 'PlanRequired',
                        'message' => '请选择套餐',
                    ],
                ], 422);
            }

            $query->notDeleted()->get()->each(function (User $target) use ($plan, $quota, $request): void {
                $target->forceFill(['plan_id' => (string) $plan['id']])->save();
                $this->grantUserPlanQuota($target, $plan, $quota, $request->user()->id);
            });
        }

        return response()->json([
            'ok' => true,
            'updated_ids' => array_values(array_map('strval', $data['ids'])),
        ]);
    }

    public function jobs(Request $request): JsonResponse
    {
        [$page, $perPage] = $this->paginationParams($request);

        return response()->json($this->paginateJobQuery(
            $this->jobQuery($request->user()->id),
            $page,
            $perPage
        ));
    }

    public function allJobs(Request $request, AudioRetentionService $retention): JsonResponse
    {
        $retention->pruneOpportunistically();
        [$page, $perPage] = $this->paginationParams($request);
        $query = $this->jobQuery();
        $this->applyJobFilters($query, $request);
        $payload = $this->paginateJobQuery($query, $page, $perPage);
        $payload['filters'] = [
            'users' => $this->jobUserOptions(),
        ];

        return response()->json($payload);
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
                    'createdAt' => DisplayTime::format($log->created_at),
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
                    'updatedAt' => DisplayTime::format($setting->updated_at),
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
            'icon_url' => ['nullable', 'url', 'max:2048'],
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
            'icon_url' => array_key_exists('icon_url', $data) ? $data['icon_url'] : $current['icon_url'],
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

    public function uploadBasicIcon(Request $request, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'icon' => ['required', 'file', 'max:2048', 'mimetypes:image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon,image/vnd.microsoft.icon'],
        ]);

        $file = $data['icon'];
        $extension = strtolower($file->getClientOriginalExtension() ?: $file->extension() ?: 'png');
        $allowedExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'ico'];

        if (! in_array($extension, $allowedExtensions, true)) {
            return response()->json([
                'error' => [
                    'code' => 'InvalidIconType',
                    'message' => '图标仅支持 PNG、JPG、WEBP、GIF、SVG、ICO 格式',
                ],
            ], 422);
        }

        $directory = storage_path('app/public/site-icons');
        if (! is_dir($directory)) {
            mkdir($directory, 0775, true);
        }

        $filename = 'site-icon-'.now()->format('YmdHis').'-'.Str::random(8).'.'.$extension;
        $file->move($directory, $filename);

        $current = $this->basicInfoConfig();
        $iconUrl = $this->siteIconUrl($request, $filename);

        SystemSetting::putPlain(self::BASIC_INFO_KEY, [
            'system_name' => $current['system_name'],
            'site_title' => $current['site_title'],
            'site_subtitle' => $current['site_subtitle'],
            'icon_url' => $iconUrl,
            'app_url' => $current['app_url'],
            'frontend_url' => $current['frontend_url'],
            'icp_record' => $current['icp_record'],
            'footer_text' => $current['footer_text'],
            'support_email' => $current['support_email'],
        ]);

        $this->deleteManagedSiteIcon($current['icon_url']);

        $audit->record($request, 'basic_info.icon.upload', 'system_setting', null, [
            'filename' => $filename,
        ]);

        return response()->json([
            'url' => $iconUrl,
            'config' => $this->basicInfoConfig(),
        ]);
    }

    public function siteIcon(string $filename)
    {
        if (! preg_match('/^site-icon-[A-Za-z0-9._-]+\.(png|jpe?g|webp|gif|svg|ico)$/i', $filename)) {
            abort(404);
        }

        $path = storage_path('app/public/site-icons/'.$filename);
        if (! is_file($path)) {
            abort(404);
        }

        return response()->file($path, [
            'Cache-Control' => 'public, max-age=31536000, immutable',
            'Content-Type' => mime_content_type($path) ?: 'application/octet-stream',
        ]);
    }

    public function audioRetention(AudioRetentionService $retention): JsonResponse
    {
        return response()->json([
            'config' => $retention->config(),
        ]);
    }

    public function updateAudioRetention(Request $request, AudioRetentionService $retention, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'retention_days' => ['required', 'integer', 'min:1', 'max:3650'],
        ]);

        $config = $retention->save($data);
        $audit->record($request, 'audio_retention_config.update', 'system_setting', null, [
            'key' => AudioRetentionService::KEY,
            'enabled' => $config['enabled'],
            'retention_days' => $config['retention_days'],
        ]);

        return response()->json([
            'config' => $config,
        ]);
    }

    private function taskStats($query): array
    {
        $statusCounts = (clone $query)
            ->selectRaw('status, count(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status');
        $moduleCounts = [];

        foreach ((clone $query)
            ->selectRaw('type, count(*) as aggregate')
            ->groupBy('type')
            ->pluck('aggregate', 'type') as $type => $count) {
            $module = $this->moduleForType((string) $type);
            $moduleCounts[$module] = ($moduleCounts[$module] ?? 0) + (int) $count;
        }

        return [
            'total' => (clone $query)->count(),
            'queued' => (int) ($statusCounts['queued'] ?? 0),
            'running' => (int) ($statusCounts['running'] ?? 0),
            'completed' => (int) ($statusCounts['completed'] ?? 0),
            'failed' => (int) ($statusCounts['failed'] ?? 0),
            'modules' => $moduleCounts,
        ];
    }

    private function userStats(): array
    {
        return [
            'total' => User::query()->count(),
            'active' => User::query()->activeStatus()->count(),
            'suspended' => User::query()->where('status', User::STATUS_SUSPENDED)->count(),
            'deleted' => User::query()->where('status', User::STATUS_DELETED)->count(),
            'verified' => User::query()->whereNotNull('email_verified_at')->count(),
            'linuxdo_linked' => User::query()->whereNotNull('linuxdo_id')->count(),
        ];
    }

    private function dashboardEmailConfig(array $config): array
    {
        return [
            'enabled' => (bool) ($config['enabled'] ?? false),
            'registration_enabled' => (bool) ($config['registration_enabled'] ?? true),
            'verification_required' => (bool) ($config['verification_required'] ?? false),
            'driver' => $config['driver'] ?? 'smtp',
            'smtp_configured' => (bool) ($config['smtp_configured'] ?? false),
            'api_configured' => (bool) ($config['api_configured'] ?? false),
            'sender_configured' => (bool) ($config['sender_configured'] ?? false),
            'smtp' => [
                'host' => $config['smtp']['host'] ?? null,
                'port' => $config['smtp']['port'] ?? null,
                'username' => $config['smtp']['username'] ?? null,
                'password_configured' => (bool) ($config['smtp']['password_configured'] ?? false),
                'encryption' => $config['smtp']['encryption'] ?? null,
            ],
            'linuxdo' => $config['linuxdo'] ?? [],
        ];
    }

    private function jobQuery(?int $userId = null)
    {
        return AudioJob::query()
            ->with(['files', 'user'])
            ->when($userId, fn ($query) => $query->where('user_id', $userId))
            ->latest();
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

    private function applyJobFilters($query, Request $request): void
    {
        $keyword = trim((string) $request->query('q', ''));
        $module = (string) $request->query('module', '');
        $status = (string) $request->query('status', '');
        $userId = (int) $request->query('user_id', 0);

        if ($keyword !== '') {
            $like = $this->likePattern($keyword);
            $query->where(function ($subQuery) use ($keyword, $like): void {
                $this->whereEscapedLike($subQuery, 'model', $like);
                $this->whereEscapedLike($subQuery, 'request_payload->_input->title', $like, 'or');
                $this->whereEscapedLike($subQuery, 'error_message', $like, 'or');

                $subQuery->orWhereHas('user', function ($userQuery) use ($like): void {
                    $this->whereEscapedLike($userQuery, 'name', $like);
                    $this->whereEscapedLike($userQuery, 'email', $like, 'or');
                });

                if (ctype_digit($keyword)) {
                    $subQuery->orWhere('id', (int) $keyword);
                }
            });
        }

        $type = $this->typeForModule($module);
        if ($type) {
            $query->where('type', $type);
        }

        if (in_array($status, ['queued', 'running', 'completed', 'failed'], true)) {
            $query->where('status', $status);
        }

        if ($userId > 0) {
            $query->where('user_id', $userId);
        }
    }

    private function paginateUserQuery($query, int $page, int $perPage): array
    {
        $total = (clone $query)->count();
        $pageCount = max(1, (int) ceil($total / $perPage));
        $safePage = min($page, $pageCount);

        return [
            'users' => (clone $query)
                ->forPage($safePage, $perPage)
                ->get()
                ->map(fn (User $user) => $this->serializeUser($user))
                ->values(),
            'pagination' => [
                'page' => $safePage,
                'perPage' => $perPage,
                'total' => $total,
                'pageCount' => $pageCount,
            ],
        ];
    }

    private function applyUserFilters($query, Request $request, BillingConfigService $billing): void
    {
        $keyword = trim((string) $request->query('q', ''));
        $role = (string) $request->query('role', '');
        $status = (string) $request->query('status', '');
        $planId = (string) $request->query('plan_id', '');
        $email = (string) $request->query('email', '');
        $linuxDo = (string) $request->query('linuxdo', '');

        if ($keyword !== '') {
            $like = $this->likePattern($keyword);
            $matchingPlanIds = $this->matchingPlanIds($billing, $keyword);

            $query->where(function ($subQuery) use ($keyword, $like, $matchingPlanIds): void {
                $this->whereEscapedLike($subQuery, 'name', $like);
                $this->whereEscapedLike($subQuery, 'email', $like, 'or');
                $this->whereEscapedLike($subQuery, 'linuxdo_id', $like, 'or');
                $this->whereEscapedLike($subQuery, 'plan_id', $like, 'or');

                if ($matchingPlanIds) {
                    $subQuery->orWhereIn('plan_id', $matchingPlanIds);
                }

                if (ctype_digit($keyword)) {
                    $subQuery->orWhere('id', (int) $keyword);
                }
            });
        }

        if (in_array($role, ['admin', 'user'], true)) {
            $query->where('is_admin', $role === 'admin');
        }

        if ($status === User::STATUS_ACTIVE) {
            $query->activeStatus();
        } elseif ($status === User::STATUS_SUSPENDED) {
            $query->where('status', User::STATUS_SUSPENDED);
        } elseif ($status === User::STATUS_DELETED) {
            $query->where('status', User::STATUS_DELETED);
        }

        if ($planId === '__none') {
            $query->where(fn ($planQuery) => $planQuery
                ->whereNull('plan_id')
                ->orWhere('plan_id', ''));
        } elseif ($planId !== '' && $planId !== 'all') {
            $query->where('plan_id', $planId);
        }

        if ($email === 'verified') {
            $query->whereNotNull('email_verified_at');
        } elseif ($email === 'unverified') {
            $query->whereNull('email_verified_at');
        }

        if ($linuxDo === 'linked') {
            $query->whereNotNull('linuxdo_id');
        } elseif ($linuxDo === 'unlinked') {
            $query->whereNull('linuxdo_id');
        }
    }

    private function matchingPlanIds(BillingConfigService $billing, string $keyword): array
    {
        $needle = Str::lower($keyword);

        return array_values(array_filter(array_map(
            function (array $plan) use ($needle): ?string {
                $id = (string) ($plan['id'] ?? '');
                $name = (string) ($plan['name'] ?? '');
                $haystack = Str::lower(trim($id.' '.$name));

                return $haystack !== '' && Str::contains($haystack, $needle) ? $id : null;
            },
            $billing->config()['plans'] ?? []
        )));
    }

    private function likePattern(string $keyword): string
    {
        return '%'.str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $keyword).'%';
    }

    private function whereEscapedLike($query, string $column, string $pattern, string $boolean = 'and'): void
    {
        $wrapped = $query->getQuery()->getGrammar()->wrap($column);
        $escapeSql = $query->getQuery()->getConnection()->getDriverName() === 'sqlite'
            ? " ESCAPE '\\'"
            : " ESCAPE '\\\\'";

        $query->whereRaw($wrapped.' LIKE ?'.$escapeSql, [$pattern], $boolean);
    }

    private function jobUserOptions(): array
    {
        return User::query()
            ->whereIn('id', AudioJob::query()->select('user_id')->distinct())
            ->orderBy('name')
            ->get()
            ->map(fn (User $user) => [
                'id' => (string) $user->id,
                'label' => $user->name ?: ($user->email ?: '用户 '.$user->id),
                'email' => $user->email,
            ])
            ->values()
            ->all();
    }

    private function serializeUser(User $user): array
    {
        return [
            'id' => (string) $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->is_admin ? 'admin' : 'user',
            'isSuperAdmin' => $user->isSuperAdmin(),
            'is_super_admin' => $user->isSuperAdmin(),
            'status' => $user->status ?: 'active',
            'planId' => $user->plan_id,
            'quotaBalance' => (int) $user->quota_balance,
            'emailVerifiedAt' => DisplayTime::format($user->email_verified_at),
            'avatarUrl' => $user->avatar_url,
            'linuxdoId' => $user->linuxdo_id,
            'lastLoginAt' => DisplayTime::format($user->last_login_at),
            'createdAt' => DisplayTime::format($user->created_at),
        ];
    }

    private function planIds(BillingConfigService $billing): array
    {
        return array_values(array_filter(array_map(
            fn (array $plan) => (string) ($plan['id'] ?? ''),
            $billing->config()['plans'] ?? []
        )));
    }

    private function canManageUser(User $actor, User $target): bool
    {
        return $actor->isSuperAdmin() || ! $target->isSuperAdmin();
    }

    private function superAdminProtectedResponse(): JsonResponse
    {
        return response()->json([
            'error' => [
                'code' => 'SuperAdminProtected',
                'message' => '只有超级管理员可以修改默认管理员账号',
            ],
        ], 403);
    }

    private function planById(BillingConfigService $billing, ?string $planId): ?array
    {
        if (! $planId) {
            return null;
        }

        foreach ($billing->config()['plans'] ?? [] as $plan) {
            if ((string) ($plan['id'] ?? '') === $planId) {
                return $plan;
            }
        }

        return null;
    }

    private function grantUserPlanQuota(User $user, array $plan, QuotaService $quota, int $adminUserId): void
    {
        $planQuota = max(0, (int) ($plan['quota'] ?? 0));
        $quota->grant($user, $planQuota, QuotaService::TYPE_GRANT, '分配套餐额度', [
            'admin_user_id' => $adminUserId,
            'target_user_id' => $user->id,
            'adjustment_mode' => 'add',
            'source' => 'admin_plan_assignment',
            'plan_id' => (string) ($plan['id'] ?? ''),
            'plan_name' => (string) ($plan['name'] ?? ''),
            'plan_quota' => $planQuota,
        ]);
    }

    private function basicInfoConfig(): array
    {
        $setting = SystemSetting::query()->where('key', self::BASIC_INFO_KEY)->first();
        $value = $setting ? $setting->decodedValue() : [];

        return [
            'system_name' => $value['system_name'] ?? config('app.name'),
            'site_title' => $value['site_title'] ?? config('app.name'),
            'site_subtitle' => $value['site_subtitle'] ?? '',
            'icon_url' => $value['icon_url'] ?? '',
            'app_url' => $value['app_url'] ?? config('app.url'),
            'frontend_url' => $value['frontend_url'] ?? config('app.frontend_url'),
            'icp_record' => $value['icp_record'] ?? '',
            'footer_text' => $value['footer_text'] ?? '',
            'support_email' => $value['support_email'] ?? config('mail.from.address'),
            'build' => app(BuildInfoService::class)->info(),
        ];
    }

    private function siteIconUrl(Request $request, string $filename): string
    {
        $config = $this->basicInfoConfig();
        $base = rtrim($config['app_url'] ?: $request->getSchemeAndHttpHost(), '/');
        $encodedFilename = rawurlencode($filename);
        $scriptName = (string) $request->server('SCRIPT_NAME', '');

        if (basename($scriptName) === 'api.php') {
            return $base.'/api.php?r=/site-icons/'.$encodedFilename;
        }

        return $base.'/api/site-icons/'.$encodedFilename;
    }

    private function deleteManagedSiteIcon(?string $iconUrl): void
    {
        if (! $iconUrl) {
            return;
        }

        $parts = parse_url($iconUrl);
        $path = $parts['path'] ?? '';
        $query = $parts['query'] ?? '';

        if ($query) {
            parse_str($query, $queryParams);
            if (isset($queryParams['r']) && strpos((string) $queryParams['r'], '/site-icons/') === 0) {
                $path = (string) $queryParams['r'];
            }
        }

        $filename = basename($path);
        if (! preg_match('/^site-icon-[A-Za-z0-9._-]+\.(png|jpe?g|webp|gif|svg|ico)$/i', $filename)) {
            return;
        }

        $filePath = storage_path('app/public/site-icons/'.$filename);
        if (is_file($filePath)) {
            @unlink($filePath);
        }
    }

    private function serializeJob(AudioJob $job): array
    {
        $file = $job->files->firstWhere('kind', 'generated') ?? $job->files->first();
        $requestPayload = is_array($job->request_payload) ? $job->request_payload : [];
        $requestMeta = $requestPayload['_meta'] ?? [];
        $input = is_array($requestPayload['_input'] ?? null) ? $requestPayload['_input'] : [];
        $title = trim((string) ($input['title'] ?? ''));

        return [
            'id' => (string) $job->id,
            'module' => $this->moduleForType($job->type),
            'title' => $title !== '' ? $title : $job->model,
            'status' => $job->status,
            'progress' => $job->status === 'completed' ? 100 : ($job->status === 'failed' ? 100 : 50),
            'createdAt' => $this->formatTaskTime($job->created_at),
            'startedAt' => $this->formatTaskTime($job->started_at),
            'completedAt' => $this->formatTaskTime($job->completed_at),
            'outputUrl' => $file ? '/mimo/files/'.$file->id : null,
            'summary' => $job->error_message ?: ($job->status === 'completed' ? '处理完成' : '等待处理'),
            'errorMessage' => $job->error_message,
            'requestSummary' => app(AudioJobPayloadSummary::class)->forJob($job),
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

    private function typeForModule(string $module): ?string
    {
        switch ($module) {
            case 'speech-recognition':
                return 'asr';
            case 'speech-synthesis':
                return 'tts';
            case 'voice-design':
                return 'voice_design';
            case 'voice-clone':
                return 'voice_clone';
            default:
                return null;
        }
    }
}
