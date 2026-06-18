<?php

namespace App\Http\Controllers;

use App\Services\HealthCheckService;
use Illuminate\Http\JsonResponse;

class HealthController
{
    public function show(HealthCheckService $health): JsonResponse
    {
        $report = $health->report();

        return response()->json($report, $report['status'] === 'error' ? 503 : 200);
    }
}
