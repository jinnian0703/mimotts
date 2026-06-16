<?php

namespace App\Http\Controllers;

use App\Services\BillingConfigService;
use App\Services\QuotaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class QuotaController
{
    public function summary(Request $request, BillingConfigService $billing, QuotaService $quota): JsonResponse
    {
        return response()->json([
            'quota' => $quota->summary($request->user(), $billing->config()),
        ]);
    }

    public function checkIn(Request $request, BillingConfigService $billing, QuotaService $quota): JsonResponse
    {
        try {
            $result = $quota->checkIn($request->user(), $billing->config());
        } catch (RuntimeException $e) {
            return response()->json([
                'error' => [
                    'code' => 'CheckInUnavailable',
                    'message' => $e->getMessage(),
                ],
            ], 422);
        }

        return response()->json([
            'checked' => (bool) $result['checked'],
            'message' => $result['message'],
            'entry' => $result['entry'],
            'quota' => $quota->summary($request->user(), $billing->config()),
        ]);
    }
}
