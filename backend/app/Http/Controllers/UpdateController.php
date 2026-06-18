<?php

namespace App\Http\Controllers;

use App\Services\AuditLogger;
use App\Services\UpdateService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UpdateController
{
    public function status(UpdateService $updates): JsonResponse
    {
        return response()->json($updates->status());
    }

    public function upgrade(Request $request, UpdateService $updates, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'mode' => ['nullable', Rule::in(['source', 'docker'])],
        ]);

        $result = $updates->upgrade($data['mode'] ?? null);

        $audit->record($request, 'system_update.upgrade', 'system', null, [
            'executed' => $result['executed'] ?? false,
            'message' => $result['message'] ?? '',
        ]);

        return response()->json($result);
    }
}
