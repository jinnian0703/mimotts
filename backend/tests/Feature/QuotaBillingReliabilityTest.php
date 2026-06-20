<?php

namespace Tests\Feature;

use App\Models\AudioJob;
use App\Models\BillingOrder;
use App\Models\QuotaLedgerEntry;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\AudioJobProcessor;
use App\Services\BillingConfigService;
use App\Services\MimoConfigService;
use App\Services\QuotaService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class QuotaBillingReliabilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_adjusts_quota_by_delta_with_required_reason(): void
    {
        $admin = User::factory()->admin()->create();
        $user = User::factory()->create(['quota_balance' => 10]);

        $this->actingAs($admin)
            ->postJson('/api/admin/users/'.$user->id.'/quota-adjustments', [
                'mode' => 'add',
                'amount' => 15,
                'reason' => '线下补偿',
            ])
            ->assertOk()
            ->assertJsonPath('user.quotaBalance', 25)
            ->assertJsonPath('entry.amount', 15)
            ->assertJsonPath('entry.description', '线下补偿')
            ->assertJsonPath('entry.metadata.admin_user_id', $admin->id);

        $this->actingAs($admin)
            ->postJson('/api/admin/users/'.$user->id.'/quota-adjustments', [
                'mode' => 'subtract',
                'amount' => 5,
                'reason' => '测试扣减',
            ])
            ->assertOk()
            ->assertJsonPath('user.quotaBalance', 20)
            ->assertJsonPath('entry.amount', -5)
            ->assertJsonPath('entry.description', '测试扣减');
    }

    public function test_admin_quota_adjustment_requires_reason(): void
    {
        $admin = User::factory()->admin()->create();
        $user = User::factory()->create(['quota_balance' => 10]);

        $this->actingAs($admin)
            ->postJson('/api/admin/users/'.$user->id.'/quota-adjustments', [
                'mode' => 'add',
                'amount' => 5,
            ])
            ->assertStatus(422);
    }

    public function test_admin_assigning_plan_adds_plan_quota(): void
    {
        $admin = User::factory()->admin()->create();
        $user = User::factory()->create(['quota_balance' => 30]);
        $this->saveBillingConfig([
            'plans' => [
                ['id' => 'starter', 'name' => '基础版', 'quota' => 100, 'base_amount' => 10, 'enabled' => true],
            ],
        ]);

        $this->actingAs($admin)
            ->putJson('/api/admin/users/'.$user->id, [
                'name' => $user->name,
                'email' => $user->email,
                'role' => 'user',
                'status' => 'active',
                'plan_id' => 'starter',
            ])
            ->assertOk()
            ->assertJsonPath('user.planId', 'starter')
            ->assertJsonPath('user.quotaBalance', 130);

        $this->assertSame(130, (int) $user->fresh()->quota_balance);
        $entry = QuotaLedgerEntry::where('type', QuotaService::TYPE_GRANT)->firstOrFail();
        $this->assertSame(100, (int) $entry->amount);
        $this->assertSame(130, (int) $entry->balance_after);
        $this->assertSame('admin_plan_assignment', $entry->metadata['source'] ?? null);
    }

    public function test_bulk_plan_assignment_adds_plan_quota(): void
    {
        $admin = User::factory()->admin()->create();
        $lowBalanceUser = User::factory()->create(['quota_balance' => 30]);
        $highBalanceUser = User::factory()->create(['quota_balance' => 150]);
        $this->saveBillingConfig([
            'plans' => [
                ['id' => 'starter', 'name' => '基础版', 'quota' => 100, 'base_amount' => 10, 'enabled' => true],
            ],
        ]);

        $this->actingAs($admin)
            ->postJson('/api/admin/users/bulk', [
                'ids' => [$lowBalanceUser->id, $highBalanceUser->id],
                'action' => 'set_plan',
                'plan_id' => 'starter',
            ])
            ->assertOk();

        $this->assertSame(130, (int) $lowBalanceUser->fresh()->quota_balance);
        $this->assertSame(250, (int) $highBalanceUser->fresh()->quota_balance);
        $this->assertSame('starter', $lowBalanceUser->fresh()->plan_id);
        $this->assertSame('starter', $highBalanceUser->fresh()->plan_id);
        $this->assertSame(2, QuotaLedgerEntry::where('type', QuotaService::TYPE_GRANT)->count());
    }

    public function test_default_plan_can_be_disabled(): void
    {
        $this->saveBillingConfig([
            'default_plan_id' => null,
            'plans' => [
                ['id' => 'starter', 'name' => '基础版', 'quota' => 100, 'base_amount' => 10, 'enabled' => true],
            ],
        ]);

        $this->assertNull(app(BillingConfigService::class)->defaultPlan());
    }

    public function test_source_upload_checkout_uses_api_php_notify_url(): void
    {
        $user = User::factory()->create(['quota_balance' => 0]);
        $this->saveBillingConfig([
            'notify_url' => null,
            'return_url' => null,
            'plans' => [
                ['id' => 'starter', 'name' => '基础版', 'quota' => 100, 'base_amount' => 10, 'enabled' => true],
            ],
        ]);

        $this->actingAs($user)
            ->withServerVariables([
                'HTTP_HOST' => 'mimotts.example.com',
                'HTTPS' => 'on',
                'SCRIPT_NAME' => '/api.php',
            ])
            ->postJson('/api/billing/checkout', ['plan_id' => 'starter'])
            ->assertOk()
            ->assertJsonPath('checkout_params.notify_url', 'https://mimotts.example.com/api.php?r=/billing/notify')
            ->assertJsonPath('checkout_params.return_url', 'https://mimotts.example.com/billing');
    }

    public function test_paid_notify_is_idempotent_and_uses_order_snapshot_after_plan_changes(): void
    {
        $user = User::factory()->create(['quota_balance' => 0]);
        $this->saveBillingConfig([
            'plans' => [
                ['id' => 'starter', 'name' => '旧套餐', 'quota' => 100, 'base_amount' => 10, 'enabled' => true],
            ],
        ]);

        $checkout = $this->actingAs($user)
            ->postJson('/api/billing/checkout', ['plan_id' => 'starter'])
            ->assertOk()
            ->json();

        $order = BillingOrder::query()->where('out_trade_no', $checkout['out_trade_no'])->firstOrFail();
        $this->assertSame('旧套餐', $order->plan_name);

        $this->saveBillingConfig([
            'plans' => [
                ['id' => 'starter', 'name' => '新套餐', 'quota' => 999, 'base_amount' => 10, 'enabled' => true],
            ],
        ]);

        $params = $this->signedNotifyParams($order->out_trade_no, '10.00');
        $this->post('/api/billing/notify', $params)->assertSee('success');
        $this->post('/api/billing/notify', $params)->assertSee('success');

        $user->refresh();
        $order->refresh();

        $this->assertSame(100, (int) $user->quota_balance);
        $this->assertSame('paid', $order->status);
        $this->assertSame(1, QuotaLedgerEntry::where('type', QuotaService::TYPE_PURCHASE)->count());
        $this->assertSame(1, (int) (($order->metadata ?? [])['duplicate_notify_count'] ?? 0));

        $entry = QuotaLedgerEntry::where('type', QuotaService::TYPE_PURCHASE)->firstOrFail();
        $this->assertSame('旧套餐', $entry->metadata['plan_snapshot']['name'] ?? null);
        $this->assertSame(100, $entry->metadata['plan_snapshot']['quota'] ?? null);
    }

    public function test_notify_rejects_wrong_amount_without_granting_quota(): void
    {
        $user = User::factory()->create(['quota_balance' => 0]);
        $this->saveBillingConfig([
            'plans' => [
                ['id' => 'starter', 'name' => '基础版', 'quota' => 100, 'base_amount' => 10, 'enabled' => true],
            ],
        ]);

        $checkout = $this->actingAs($user)
            ->postJson('/api/billing/checkout', ['plan_id' => 'starter'])
            ->assertOk()
            ->json();
        $order = BillingOrder::query()->where('out_trade_no', $checkout['out_trade_no'])->firstOrFail();

        $this->post('/api/billing/notify', $this->signedNotifyParams($order->out_trade_no, '1.00'))
            ->assertStatus(400);

        $this->assertSame(0, (int) $user->fresh()->quota_balance);
        $this->assertSame(0, QuotaLedgerEntry::where('type', QuotaService::TYPE_PURCHASE)->count());
    }

    public function test_failed_billable_task_refunds_consumed_quota(): void
    {
        Http::fake([
            'https://system.example.com/chat/completions' => Http::response(['error' => 'upstream failed'], 500),
        ]);

        $user = User::factory()->create(['quota_balance' => 5]);
        app(MimoConfigService::class)->setSystemConfig('system-key', 'https://system.example.com');
        $this->saveBillingConfig([
            'usage_costs' => [
                'asr' => 1,
                'tts' => 2,
                'voice_design' => 2,
                'voice_clone' => 3,
            ],
        ]);

        $this->actingAs($user)
            ->postJson('/api/mimo/tts', [
                'text' => '测试文本',
                'response_format' => 'wav',
            ])
            ->assertOk()
            ->assertJsonPath('queued', true)
            ->assertJsonPath('job.status', 'queued');

        app(AudioJobProcessor::class)->process(AudioJob::query()->firstOrFail());

        $this->assertSame(5, (int) $user->fresh()->quota_balance);
        $this->assertSame(-2, (int) QuotaLedgerEntry::where('type', QuotaService::TYPE_CONSUME)->firstOrFail()->amount);
        $this->assertSame(2, (int) QuotaLedgerEntry::where('type', QuotaService::TYPE_REFUND)->firstOrFail()->amount);
    }

    private function saveBillingConfig(array $overrides = []): void
    {
        app(BillingConfigService::class)->save(array_merge([
            'enabled' => true,
            'gateway_url' => 'https://pay.example.com',
            'client_id' => 'pid-1',
            'client_secret' => 'secret-1',
            'credit_multiplier' => 1,
            'default_plan_id' => 'starter',
            'notify_url' => 'https://app.example.com/api/billing/notify',
            'return_url' => 'https://app.example.com/billing',
        ], $overrides));
    }

    private function signedNotifyParams(string $outTradeNo, string $money): array
    {
        $params = [
            'pid' => 'pid-1',
            'out_trade_no' => $outTradeNo,
            'trade_no' => 'trade-'.$outTradeNo,
            'trade_status' => 'TRADE_SUCCESS',
            'money' => $money,
        ];

        ksort($params);
        $pairs = [];
        foreach ($params as $name => $value) {
            $pairs[] = $name.'='.$value;
        }
        $params['sign'] = md5(implode('&', $pairs).'secret-1');
        $params['sign_type'] = 'MD5';

        return $params;
    }
}
