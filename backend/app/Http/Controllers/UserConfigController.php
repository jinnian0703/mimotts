<?php

namespace App\Http\Controllers;

use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class UserConfigController
{
    public function show(Request $request): JsonResponse
    {
        $config = $request->user()->apiConfig;

        return response()->json([
            'config' => $config ? [
                'base_url' => $config->base_url,
                'enabled' => $config->enabled,
                'configured' => true,
            ] : [
                'base_url' => null,
                'enabled' => false,
                'configured' => false,
            ],
        ]);
    }

    public function update(Request $request, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'api_key' => ['nullable', 'string', 'max:4096'],
            'base_url' => ['nullable', 'url', 'max:2048'],
            'enabled' => ['sometimes', 'boolean'],
        ]);

        $current = $request->user()->apiConfig;
        $apiKey = $data['api_key'] ?? ($current ? $current->api_key : null);
        if (! $apiKey) {
            throw ValidationException::withMessages([
                'api_key' => ['API Key 必填'],
            ]);
        }

        $config = $request->user()->apiConfig()->updateOrCreate(
            ['user_id' => $request->user()->id],
            [
                'api_key' => $apiKey,
                'base_url' => $data['base_url'] ?? ($current ? $current->base_url : null),
                'enabled' => $data['enabled'] ?? true,
            ]
        );
        $audit->record($request, 'user.mimo_config.update');

        return response()->json([
            'config' => [
                'base_url' => $config->base_url,
                'enabled' => $config->enabled,
                'configured' => true,
            ],
        ]);
    }

    public function destroy(Request $request, AuditLogger $audit): JsonResponse
    {
        $config = $request->user()->apiConfig;
        if ($config) {
            $config->delete();
        }
        $audit->record($request, 'user.mimo_config.delete');

        return response()->json(['ok' => true]);
    }
}
