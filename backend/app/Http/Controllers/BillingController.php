<?php

namespace App\Http\Controllers;

use App\Models\BillingOrder;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\BillingConfigService;
use App\Services\QuotaService;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class BillingController
{
    public function show(BillingConfigService $billing): JsonResponse
    {
        return response()->json([
            'config' => $billing->publicConfig(),
        ]);
    }

    public function checkout(Request $request, BillingConfigService $billing, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'plan_id' => ['required', 'string', 'max:64'],
        ]);

        $config = $billing->config();
        if (! $config['enabled'] || empty($config['client_id']) || empty($config['client_secret'])) {
            return response()->json([
                'error' => [
                    'code' => 'BillingUnavailable',
                    'message' => '套餐计费未启用',
                ],
            ], 403);
        }

        $plan = $billing->plan($data['plan_id']);
        if (! $plan) {
            return response()->json([
                'error' => [
                    'code' => 'PlanUnavailable',
                    'message' => '套餐不可用',
                ],
            ], 404);
        }

        $tradeNo = 'MIMO'.date('YmdHis').$request->user()->id.strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
        $returnUrl = $config['return_url'] ?: rtrim($this->baseUrl($request), '/').'/billing';
        $notifyUrl = $config['notify_url'] ?: $this->apiUrl($request, '/billing/notify');
        $creditAmount = $billing->creditAmountForPlan($plan);
        $planSnapshot = $this->planSnapshot($plan, $config, $creditAmount);

        $params = [
            'pid' => $config['client_id'],
            'type' => 'epay',
            'out_trade_no' => $tradeNo,
            'notify_url' => $notifyUrl,
            'return_url' => $returnUrl,
            'name' => $plan['name'],
            'money' => $creditAmount,
        ];
        $params['sign'] = $this->sign($params, $config['client_secret']);
        $params['sign_type'] = 'MD5';

        BillingOrder::create([
            'user_id' => $request->user()->id,
            'plan_id' => $plan['id'],
            'plan_name' => $plan['name'],
            'quota' => (int) $plan['quota'],
            'amount' => (float) $creditAmount,
            'out_trade_no' => $tradeNo,
            'status' => 'pending',
            'metadata' => [
                'provider' => $config['provider'] ?? 'linuxdo_credit',
                'plans_revision' => (int) ($config['plans_revision'] ?? 1),
                'plan_snapshot' => $planSnapshot,
            ],
        ]);

        $audit->record($request, 'billing.checkout', 'plan', null, [
            'plan_id' => $plan['id'],
            'out_trade_no' => $tradeNo,
        ]);

        return response()->json([
            'checkout_url' => rtrim($config['gateway_url'], '/').'/pay/submit.php',
            'checkout_method' => 'POST',
            'checkout_params' => $params,
            'out_trade_no' => $tradeNo,
        ]);
    }

    public function notify(Request $request, BillingConfigService $billing, AuditLogger $audit, QuotaService $quotaService)
    {
        $config = $billing->config();
        $params = $request->all();
        $sign = (string) ($params['sign'] ?? '');
        $secret = (string) ($config['client_secret'] ?? '');

        if (! $config['enabled'] || empty($config['client_id']) || $secret === '' || $sign === '') {
            return response('fail', 400);
        }

        if (! hash_equals($sign, $this->sign($params, $secret))) {
            return response('fail', 400);
        }

        $outTradeNo = (string) ($params['out_trade_no'] ?? '');
        $tradeStatus = strtoupper((string) ($params['trade_status'] ?? 'TRADE_SUCCESS'));

        if ($outTradeNo === '') {
            return response('fail', 400);
        }

        if (isset($params['pid']) && (string) $params['pid'] !== (string) $config['client_id']) {
            $audit->record($request, 'billing.notify.invalid_pid', 'trade', null, [
                'out_trade_no' => $outTradeNo,
            ]);

            return response('fail', 400);
        }

        $order = BillingOrder::query()->where('out_trade_no', $outTradeNo)->first();
        if (! $order) {
            $audit->record(
                $request,
                'billing.notify.missing_order',
                'trade',
                null,
                $this->missingOrderNotifyContext($request, $config, $params, $outTradeNo, $tradeStatus)
            );

            return response('fail', 404);
        }

        if (in_array($tradeStatus, ['TRADE_SUCCESS', 'TRADE_FINISHED', 'SUCCESS'], true)) {
            if (! $this->amountMatches($params['money'] ?? null, $order->amount)) {
                $audit->record($request, 'billing.notify.invalid_amount', 'trade', $order->id, [
                    'out_trade_no' => $outTradeNo,
                    'received_money' => $params['money'] ?? null,
                    'expected_amount' => (string) $order->amount,
                ]);

                return response('fail', 400);
            }

            DB::transaction(function () use ($request, $order, $params, $quotaService): void {
                $lockedOrder = BillingOrder::query()->whereKey($order->id)->lockForUpdate()->first();
                if (! $lockedOrder) {
                    return;
                }

                if ($lockedOrder->status === 'paid') {
                    $metadata = $lockedOrder->metadata ?? [];
                    $metadata['duplicate_notify_count'] = (int) ($metadata['duplicate_notify_count'] ?? 0) + 1;
                    $metadata['last_duplicate_notify_at'] = now()->toISOString();
                    $metadata['last_duplicate_trade_no'] = $params['trade_no'] ?? null;
                    $lockedOrder->forceFill(['metadata' => $metadata])->save();

                    return;
                }

                $user = User::query()->whereKey($lockedOrder->user_id)->lockForUpdate()->first();
                if (! $user) {
                    return;
                }

                $user->forceFill([
                    'plan_id' => $lockedOrder->plan_id,
                ])->save();

                $entry = $quotaService->grantLocked(
                    $user,
                    (int) $lockedOrder->quota,
                    QuotaService::TYPE_PURCHASE,
                    '套餐充值',
                    [
                        'billing_order_id' => $lockedOrder->id,
                        'plan_id' => $lockedOrder->plan_id,
                        'plan_name' => $lockedOrder->plan_name,
                        'plan_snapshot' => ($lockedOrder->metadata ?? [])['plan_snapshot'] ?? null,
                        'out_trade_no' => $lockedOrder->out_trade_no,
                        'trade_no' => $params['trade_no'] ?? null,
                    ]
                );

                $lockedOrder->forceFill([
                    'status' => 'paid',
                    'trade_no' => $params['trade_no'] ?? null,
                    'paid_at' => now(),
                    'metadata' => array_merge($lockedOrder->metadata ?? [], [
                        'trade_status' => $params['trade_status'] ?? null,
                        'paid_ledger_entry_id' => $entry ? $entry->id : null,
                    ]),
                ])->save();
            });
        }

        $audit->record($request, 'billing.notify', 'trade', null, [
            'out_trade_no' => $outTradeNo,
            'trade_no' => $params['trade_no'] ?? null,
            'trade_status' => $tradeStatus,
        ]);

        return response('success');
    }

    public function adminShow(BillingConfigService $billing): JsonResponse
    {
        return response()->json([
            'config' => $billing->adminConfig(),
        ]);
    }

    public function adminUpdate(Request $request, BillingConfigService $billing, AuditLogger $audit): JsonResponse
    {
        $plans = $request->input('plans', $billing->config()['plans']);
        if (is_string($plans)) {
            $decoded = json_decode($plans, true);
            $plans = is_array($decoded) ? $decoded : $billing->config()['plans'];
        }
        $planIds = array_values(array_filter(array_map(
            fn ($plan) => is_array($plan) ? (string) ($plan['id'] ?? '') : '',
            is_array($plans) ? $plans : []
        )));

        $data = $request->validate([
            'enabled' => ['sometimes', 'boolean'],
            'gateway_url' => ['nullable', 'url', 'max:2048'],
            'client_id' => ['nullable', 'string', 'max:255'],
            'client_secret' => ['nullable', 'string', 'max:4096'],
            'credit_multiplier' => ['nullable', 'numeric', 'min:0.01', 'max:1000000'],
            'default_plan_id' => ['nullable', 'string', 'max:64', Rule::in($planIds)],
            'notify_url' => ['nullable', 'url', 'max:100'],
            'return_url' => ['nullable', 'url', 'max:100'],
            'plans' => ['nullable'],
        ]);
        $data['usage_costs'] = $request->input('usage_costs', $billing->config()['usage_costs']);
        $data['checkin'] = $request->input('checkin', $billing->config()['checkin']);

        $billing->save($data);
        $audit->record($request, 'billing_config.update');

        return response()->json([
            'config' => $billing->adminConfig(),
        ]);
    }

    private function sign(array $params, string $key): string
    {
        ksort($params);
        $pairs = [];
        foreach ($params as $name => $value) {
            if ($name === 'sign' || $name === 'sign_type' || $value === '' || $value === null) {
                continue;
            }
            $pairs[] = $name.'='.$value;
        }

        return md5(implode('&', $pairs).$key);
    }

    private function planSnapshot(array $plan, array $config, string $creditAmount): array
    {
        return [
            'id' => (string) $plan['id'],
            'name' => (string) $plan['name'],
            'quota' => (int) $plan['quota'],
            'base_amount' => number_format((float) $plan['base_amount'], 2, '.', ''),
            'credit_multiplier' => (float) ($config['credit_multiplier'] ?? 1),
            'credit_amount' => $creditAmount,
            'enabled' => (bool) ($plan['enabled'] ?? true),
            'plans_revision' => (int) ($config['plans_revision'] ?? 1),
        ];
    }

    private function amountMatches($received, $expected): bool
    {
        if ($received === null || $received === '') {
            return false;
        }

        return number_format((float) $received, 2, '.', '') === number_format((float) $expected, 2, '.', '');
    }

    private function missingOrderNotifyContext(Request $request, array $config, array $params, string $outTradeNo, string $tradeStatus): array
    {
        $connection = DB::connection();

        return [
            'out_trade_no' => $outTradeNo,
            'trade_no' => $params['trade_no'] ?? null,
            'trade_status' => $tradeStatus,
            'received_pid' => $params['pid'] ?? null,
            'configured_client_id' => $config['client_id'] ?? null,
            'received_money' => $params['money'] ?? null,
            'configured_notify_url' => $config['notify_url'] ?? null,
            'derived_notify_url' => $this->apiUrl($request, '/billing/notify'),
            'request_host' => $request->getHttpHost(),
            'request_scheme' => $request->headers->get('x-forwarded-proto') ?: $request->getScheme(),
            'request_method' => $request->method(),
            'request_path' => '/'.ltrim($request->path(), '/'),
            'request_script_name' => $request->server('SCRIPT_NAME'),
            'database_connection' => DB::getDefaultConnection(),
            'database_driver' => $connection->getDriverName(),
            'database_name' => $connection->getDatabaseName(),
        ];
    }

    private function baseUrl(Request $request): string
    {
        $scheme = $request->headers->get('x-forwarded-proto') ?: $request->getScheme();

        return $scheme.'://'.$request->getHttpHost();
    }

    private function apiUrl(Request $request, string $path): string
    {
        $path = '/'.ltrim($path, '/');
        $scriptName = (string) $request->server('SCRIPT_NAME', '');

        if (basename($scriptName) === 'api.php') {
            return rtrim($this->baseUrl($request), '/').'/api.php?r='.$path;
        }

        return rtrim($this->baseUrl($request), '/').'/api'.$path;
    }
}
