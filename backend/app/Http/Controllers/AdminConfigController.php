<?php

namespace App\Http\Controllers;

use App\Services\AuditLogger;
use App\Services\MimoConfigService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class AdminConfigController
{
    public function show(MimoConfigService $configs): JsonResponse
    {
        return response()->json([
            'config' => $configs->publicSystemConfig(),
        ]);
    }

    public function update(Request $request, MimoConfigService $configs, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'api_key' => ['nullable', 'string', 'max:4096'],
            'base_url' => ['nullable', 'url', 'max:2048'],
        ]);

        $current = $configs->systemConfig();
        $apiKey = $data['api_key'] ?? $current['api_key'] ?? null;
        if (! $apiKey) {
            throw ValidationException::withMessages([
                'api_key' => ['API Key 必填'],
            ]);
        }

        $configs->setSystemConfig($apiKey, $data['base_url'] ?? ($current['base_url'] ?? null));
        $audit->record($request, 'admin.mimo_config.update');

        return response()->json([
            'config' => $configs->publicSystemConfig(),
        ]);
    }
}
