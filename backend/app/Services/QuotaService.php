<?php

namespace App\Services;

use App\Exceptions\InsufficientQuotaException;
use App\Models\AudioJob;
use App\Models\QuotaLedgerEntry;
use App\Models\User;
use App\Support\DisplayTime;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class QuotaService
{
    public const TYPE_CONSUME = 'consume';
    public const TYPE_PURCHASE = 'purchase';
    public const TYPE_CHECKIN = 'checkin';
    public const TYPE_REFUND = 'refund';
    public const TYPE_ADJUST = 'adjust';
    public const TYPE_GRANT = 'grant';

    public function defaultUsageCosts(): array
    {
        return [
            'asr' => 1,
            'tts' => 1,
            'voice_design' => 2,
            'voice_clone' => 3,
        ];
    }

    public function moduleLabels(): array
    {
        return [
            'asr' => '语音识别',
            'tts' => '语音合成',
            'voice_design' => '音色设计',
            'voice_clone' => '声音克隆',
        ];
    }

    public function normalizeUsageCosts($costs): array
    {
        $costs = is_array($costs) ? $costs : [];
        $normalized = [];

        foreach ($this->defaultUsageCosts() as $key => $default) {
            $normalized[$key] = max(0, (int) ($costs[$key] ?? $default));
        }

        return $normalized;
    }

    public function normalizeCheckinConfig($config): array
    {
        $config = is_array($config) ? $config : [];

        return [
            'enabled' => (bool) ($config['enabled'] ?? false),
            'daily_quota' => max(1, (int) ($config['daily_quota'] ?? 10)),
            'timezone' => (string) ($config['timezone'] ?? config('app.task_timezone', 'Asia/Shanghai')),
        ];
    }

    public function costFor(string $module, array $billingConfig): int
    {
        $costs = $this->normalizeUsageCosts($billingConfig['usage_costs'] ?? []);

        return max(0, (int) ($costs[$module] ?? 0));
    }

    public function assertSufficient(User $user, int $amount): void
    {
        if ($amount <= 0) {
            return;
        }

        $balance = (int) User::query()->whereKey($user->id)->value('quota_balance');
        if ($balance < $amount) {
            throw new InsufficientQuotaException($amount, $balance);
        }
    }

    public function consumeForJob(
        User $user,
        AudioJob $job,
        int $amount,
        string $module,
        string $description,
        array $metadata = []
    ): ?QuotaLedgerEntry {
        if ($amount <= 0) {
            return null;
        }

        return DB::transaction(function () use ($user, $job, $amount, $module, $description, $metadata): QuotaLedgerEntry {
            $lockedUser = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $balance = (int) $lockedUser->quota_balance;

            if ($balance < $amount) {
                throw new InsufficientQuotaException($amount, $balance);
            }

            $balanceAfter = $balance - $amount;
            $lockedUser->forceFill(['quota_balance' => $balanceAfter])->save();

            return QuotaLedgerEntry::create([
                'user_id' => $lockedUser->id,
                'audio_job_id' => $job->id,
                'type' => self::TYPE_CONSUME,
                'module' => $module,
                'amount' => -$amount,
                'balance_after' => $balanceAfter,
                'description' => $description,
                'metadata' => $metadata,
            ]);
        });
    }

    public function grant(
        User $user,
        int $amount,
        string $type,
        string $description = '',
        array $metadata = [],
        ?AudioJob $job = null
    ): ?QuotaLedgerEntry {
        if ($amount <= 0) {
            return null;
        }

        return DB::transaction(function () use ($user, $amount, $type, $description, $metadata, $job): QuotaLedgerEntry {
            $lockedUser = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $balanceAfter = (int) $lockedUser->quota_balance + $amount;
            $lockedUser->forceFill(['quota_balance' => $balanceAfter])->save();

            return QuotaLedgerEntry::create([
                'user_id' => $lockedUser->id,
                'audio_job_id' => $job ? $job->id : null,
                'type' => $type,
                'module' => $metadata['module'] ?? null,
                'amount' => $amount,
                'balance_after' => $balanceAfter,
                'description' => $description,
                'metadata' => $metadata,
            ]);
        });
    }

    public function grantDefaultPlan(User $user, ?array $plan): ?QuotaLedgerEntry
    {
        if (! $plan) {
            return null;
        }

        $amount = max(0, (int) ($plan['quota'] ?? 0));
        if ($amount <= 0) {
            return null;
        }

        return $this->grant($user, $amount, self::TYPE_GRANT, '默认套餐额度', [
            'source' => 'default_plan',
            'plan_id' => (string) ($plan['id'] ?? ''),
            'plan_name' => (string) ($plan['name'] ?? ''),
        ]);
    }

    public function grantLocked(
        User $lockedUser,
        int $amount,
        string $type,
        string $description = '',
        array $metadata = [],
        ?AudioJob $job = null
    ): ?QuotaLedgerEntry {
        if ($amount <= 0) {
            return null;
        }

        $balanceAfter = (int) $lockedUser->quota_balance + $amount;
        $lockedUser->forceFill(['quota_balance' => $balanceAfter])->save();

        return QuotaLedgerEntry::create([
            'user_id' => $lockedUser->id,
            'audio_job_id' => $job ? $job->id : null,
            'type' => $type,
            'module' => $metadata['module'] ?? null,
            'amount' => $amount,
            'balance_after' => $balanceAfter,
            'description' => $description,
            'metadata' => $metadata,
        ]);
    }

    public function adjustBalance(User $user, int $newBalance, string $description = '管理员调整', array $metadata = []): ?QuotaLedgerEntry
    {
        return DB::transaction(function () use ($user, $newBalance, $description, $metadata): ?QuotaLedgerEntry {
            $lockedUser = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $currentBalance = (int) $lockedUser->quota_balance;
            $normalizedBalance = max(0, $newBalance);
            $delta = $normalizedBalance - $currentBalance;

            if ($delta === 0) {
                return null;
            }

            $lockedUser->forceFill(['quota_balance' => $normalizedBalance])->save();

            return QuotaLedgerEntry::create([
                'user_id' => $lockedUser->id,
                'audio_job_id' => null,
                'type' => self::TYPE_ADJUST,
                'module' => null,
                'amount' => $delta,
                'balance_after' => $normalizedBalance,
                'description' => $description,
                'metadata' => array_merge($metadata, [
                    'mode' => 'set',
                    'previous_balance' => $currentBalance,
                    'new_balance' => $normalizedBalance,
                ]),
            ]);
        });
    }

    public function adjustByDelta(User $user, int $delta, string $description, array $metadata = []): ?QuotaLedgerEntry
    {
        if ($delta === 0) {
            return null;
        }

        return DB::transaction(function () use ($user, $delta, $description, $metadata): QuotaLedgerEntry {
            $lockedUser = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();
            $currentBalance = (int) $lockedUser->quota_balance;
            $balanceAfter = $currentBalance + $delta;

            if ($balanceAfter < 0) {
                throw new RuntimeException('额度不能小于 0');
            }

            $lockedUser->forceFill(['quota_balance' => $balanceAfter])->save();

            return QuotaLedgerEntry::create([
                'user_id' => $lockedUser->id,
                'audio_job_id' => null,
                'type' => self::TYPE_ADJUST,
                'module' => null,
                'amount' => $delta,
                'balance_after' => $balanceAfter,
                'description' => $description,
                'metadata' => array_merge($metadata, [
                    'mode' => 'delta',
                    'previous_balance' => $currentBalance,
                    'new_balance' => $balanceAfter,
                ]),
            ]);
        });
    }

    public function refundConsume(QuotaLedgerEntry $consumeEntry, string $description = '任务失败退回'): ?QuotaLedgerEntry
    {
        if ($consumeEntry->amount >= 0) {
            return null;
        }

        $existing = QuotaLedgerEntry::query()
            ->where('type', self::TYPE_REFUND)
            ->where('user_id', $consumeEntry->user_id)
            ->where('metadata->consume_entry_id', $consumeEntry->id)
            ->first();

        if ($existing) {
            return $existing;
        }

        return $this->grant(
            $consumeEntry->user,
            abs((int) $consumeEntry->amount),
            self::TYPE_REFUND,
            $description,
            [
                'consume_entry_id' => $consumeEntry->id,
                'audio_job_id' => $consumeEntry->audio_job_id,
                'module' => $consumeEntry->module,
            ],
            $consumeEntry->audioJob
        );
    }

    public function checkIn(User $user, array $billingConfig): array
    {
        $checkin = $this->normalizeCheckinConfig($billingConfig['checkin'] ?? []);

        if (! $checkin['enabled']) {
            throw new RuntimeException('签到功能未启用');
        }

        $entry = DB::transaction(function () use ($user, $checkin): ?QuotaLedgerEntry {
            $lockedUser = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();

            if ($this->hasCheckedInToday($lockedUser, $checkin)) {
                return null;
            }

            return $this->grantLocked(
                $lockedUser,
                (int) $checkin['daily_quota'],
                self::TYPE_CHECKIN,
                '每日签到',
                [
                    'date' => now($checkin['timezone'])->toDateString(),
                    'timezone' => $checkin['timezone'],
                ]
            );
        });

        if (! $entry) {
            return [
                'checked' => false,
                'message' => '今日已签到',
                'entry' => null,
            ];
        }

        return [
            'checked' => true,
            'message' => '签到成功',
            'entry' => $this->serializeEntry($entry),
        ];
    }

    public function summary(User $user, array $billingConfig, int $page = 1, int $perPage = 20): array
    {
        $checkin = $this->normalizeCheckinConfig($billingConfig['checkin'] ?? []);
        $freshUser = $user->fresh();
        $entryQuery = QuotaLedgerEntry::query()
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->orderByDesc('id');
        $total = (clone $entryQuery)->count();
        $safePerPage = max(1, $perPage);
        $pageCount = max(1, (int) ceil($total / $safePerPage));
        $safePage = min(max(1, $page), $pageCount);

        return [
            'balance' => $freshUser ? (int) $freshUser->quota_balance : 0,
            'usage_costs' => $this->normalizeUsageCosts($billingConfig['usage_costs'] ?? []),
            'checkin' => [
                'enabled' => (bool) $checkin['enabled'],
                'daily_quota' => (int) $checkin['daily_quota'],
                'checked_today' => $checkin['enabled'] ? $this->hasCheckedInToday($user, $checkin) : false,
                'date' => now($checkin['timezone'])->toDateString(),
            ],
            'records' => (clone $entryQuery)
                ->forPage($safePage, $safePerPage)
                ->get()
                ->map(fn (QuotaLedgerEntry $entry) => $this->serializeEntry($entry))
                ->values(),
            'pagination' => [
                'page' => $safePage,
                'perPage' => $safePerPage,
                'total' => $total,
                'pageCount' => $pageCount,
            ],
        ];
    }

    public function hasCheckedInToday(User $user, array $checkin): bool
    {
        $timezone = $checkin['timezone'] ?? config('app.task_timezone', 'Asia/Shanghai');
        $start = now($timezone)->startOfDay()->timezone(config('app.timezone', 'UTC'));
        $end = now($timezone)->endOfDay()->timezone(config('app.timezone', 'UTC'));

        return QuotaLedgerEntry::query()
            ->where('user_id', $user->id)
            ->where('type', self::TYPE_CHECKIN)
            ->whereBetween('created_at', [$start, $end])
            ->exists();
    }

    public function serializeEntry(QuotaLedgerEntry $entry): array
    {
        return [
            'id' => (string) $entry->id,
            'type' => $entry->type,
            'typeLabel' => $this->typeLabel($entry->type),
            'module' => $entry->module,
            'moduleLabel' => $this->moduleLabel($entry->module),
            'amount' => (int) $entry->amount,
            'balanceAfter' => (int) $entry->balance_after,
            'description' => $entry->description,
            'metadata' => $entry->metadata ?? [],
            'audioJobId' => $entry->audio_job_id ? (string) $entry->audio_job_id : null,
            'createdAt' => DisplayTime::format($entry->created_at),
        ];
    }

    private function moduleLabel(?string $module): ?string
    {
        if (! $module) {
            return null;
        }

        return $this->moduleLabels()[$module] ?? $module;
    }

    private function typeLabel(string $type): string
    {
        switch ($type) {
            case self::TYPE_CONSUME:
                return '接口消耗';
            case self::TYPE_PURCHASE:
                return '套餐充值';
            case self::TYPE_CHECKIN:
                return '签到';
            case self::TYPE_REFUND:
                return '退回';
            case self::TYPE_ADJUST:
                return '调整';
            case self::TYPE_GRANT:
                return '额度发放';
            default:
                return $type;
        }
    }
}
