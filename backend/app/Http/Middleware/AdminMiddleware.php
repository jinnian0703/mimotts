<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AdminMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user() || ! $request->user()->is_admin) {
            return response()->json([
                'error' => [
                    'code' => 'Forbidden',
                    'message' => '当前账号无权执行该操作',
                ],
            ], 403);
        }

        return $next($request);
    }
}
