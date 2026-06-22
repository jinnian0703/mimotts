<?php

namespace App\Http\Controllers;

use App\Services\BillingConfigService;
use App\Services\QuotaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class QuotaController
{
    private const PAGE_SIZE_OPTIONS = [20, 50, 100];

    public function summary(Request $request, BillingConfigService $billing, QuotaService $quota): JsonResponse
    {
        [$page, $perPage] = $this->paginationParams($request);

        return response()->json([
            'quota' => $quota->summary($request->user(), $billing->config(), $page, $perPage),
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
            'quota' => $quota->summary(
                $request->user(),
                $billing->config(),
                ...$this->paginationParams($request)
            ),
        ]);
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
}
