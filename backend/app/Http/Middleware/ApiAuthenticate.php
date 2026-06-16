<?php

namespace App\Http\Middleware;

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

        if ($request->user()->status === 'suspended') {
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
