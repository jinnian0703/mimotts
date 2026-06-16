<?php

namespace App\Exceptions;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

class Handler extends ExceptionHandler
{
    protected $dontReport = [
    ];

    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    public function render($request, Throwable $e)
    {
        if ($request instanceof Request && $request->is('api/*')) {
            if ($e instanceof ValidationException) {
                return response()->json([
                    'error' => [
                        'code' => 'ValidationException',
                        'message' => '请求参数不符合要求',
                        'fields' => $e->errors(),
                    ],
                ], 422);
            }

            $status = 500;
            if ($e instanceof AuthenticationException) {
                $status = 401;
            } elseif ($e instanceof AuthorizationException) {
                $status = 403;
            } elseif ($e instanceof TokenMismatchException) {
                $status = 419;
            } elseif ($e instanceof ModelNotFoundException) {
                $status = 404;
            } elseif ($e instanceof HttpExceptionInterface) {
                $status = $e->getStatusCode();
            }

            $message = $status >= 500 ? '请求处理失败' : ($e->getMessage() ?: '请求无效');
            if ($e instanceof TokenMismatchException) {
                $message = '登录状态已失效';
            }

            return response()->json([
                'error' => [
                    'code' => class_basename($e),
                    'message' => $message,
                ],
            ], $status);
        }

        return parent::render($request, $e);
    }
}
