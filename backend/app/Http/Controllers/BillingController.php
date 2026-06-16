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
        $returnUrl = $config['return_url'] ?: rtrim(config('app.frontend_url'), '/').'/billing';
        $notifyUrl = $config['notify_url'] ?: rtrim(config('app.url'), '/').'/api/billing/notify';

        $params = [
            'pid' => $config['client_id'],
            'type' => 'epay',
            'out_trade_no' => $tradeNo,
            'notify_url' => $notifyUrl,
            'return_url' => $returnUrl,
            'name' => $plan['name'],
            'money' => $billing->creditAmountForPlan($plan),
        ];
        $params['sign'] = $this->sign($params, $config['client_secret']);
        $params['sign_type'] = 'MD5';

        BillingOrder::create([
            'user_id' => $request->user()->id,
            'plan_id' => $plan['id'],
            'plan_name' => $plan['name'],
            'quota' => (int) $plan['quota'],
            'amount' => (float) $billing->creditAmountForPlan($plan),
            'out_trade_no' => $tradeNo,
            'status' => 'pending',
            'metadata' => [
                'provider' => $config['provider'] ?? 'linuxdo_credit',
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

        $order = BillingOrder::query()->where('out_trade_no', $outTradeNo)->first();
        if (! $order) {
            $audit->record($request, 'billing.notify.missing_order', 'trade', null, [
                'out_trade_no' => $outTradeNo,
                'trade_no' => $params['trade_no'] ?? null,
                'trade_status' => $tradeStatus,
            ]);

            return response('success');
        }

        if (in_array($tradeStatus, ['TRADE_SUCCESS', 'TRADE_FINISHED', 'SUCCESS'], true)) {
            DB::transaction(function () use ($request, $order, $params, $quotaService): void {
                $lockedOrder = BillingOrder::query()->whereKey($order->id)->lockForUpdate()->first();
                if (! $lockedOrder || $lockedOrder->status === 'paid') {
                    return;
                }

                $user = User::query()->whereKey($lockedOrder->user_id)->lockForUpdate()->first();
                if (! $user) {
                    return;
                }

                $user->forceFill([
                    'plan_id' => $lockedOrder->plan_id,
                ])->save();

                $quotaService->grantLocked(
                    $user,
                    (int) $lockedOrder->quota,
                    QuotaService::TYPE_PURCHASE,
                    '套餐充值',
                    [
                        'plan_id' => $lockedOrder->plan_id,
                        'plan_name' => $lockedOrder->plan_name,
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
}
