<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ApiAuthenticate
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()) {
            return response()->json([
                'error' => [
                    'code' => 'Unauthenticated',
                    'message' => '请先登录',
                ],
            ], 401);
        }

        if ($request->user()->status === User::STATUS_DELETED) {
            return response()->json([
                'error' => [
                    'code' => 'AccountDeleted',
                    'message' => '账号已注销',
                ],
            ], 403);
        }

        if ($request->user()->status === User::STATUS_SUSPENDED) {
            return response()->json([
                'error' => [
                    'code' => 'AccountSuspended',
                    'message' => '账号已暂停',
                ],
            ], 403);
        }

        return $next($request);
    }
}
