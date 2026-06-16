<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;
use Throwable;

class AuditLogger
{
    public function record(Request $request, string $action, ?string $resourceType = null, ?int $resourceId = null, array $metadata = []): void
    {
        try {
            AuditLog::create([
                'user_id' => $request->user() ? $request->user()->id : null,
                'action' => $action,
                'resource_type' => $resourceType,
                'resource_id' => $resourceId,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'metadata' => $metadata,
            ]);
        } catch (Throwable $e) {
            report($e);
        }
    }

    public function recordForUser(?User $user, Request $request, string $action, array $metadata = []): void
    {
        try {
            AuditLog::create([
                'user_id' => $user ? $user->id : null,
                'action' => $action,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'metadata' => $metadata,
            ]);
        } catch (Throwable $e) {
            report($e);
        }
    }
}
