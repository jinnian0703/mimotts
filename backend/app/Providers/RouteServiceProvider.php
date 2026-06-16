<?php

namespace App\Providers;

use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;
use Illuminate\Support\Facades\Route;

class RouteServiceProvider extends ServiceProvider
{
    public const HOME = '/';

    public function boot(): void
    {
        parent::boot();
    }

    public function map(): void
    {
        $this->mapInstallRoutes();
        $this->mapApiRoutes();
    }

    protected function mapInstallRoutes(): void
    {
        Route::prefix('api')
            ->group(function (): void {
                Route::get('/install/status', [\App\Http\Controllers\InstallController::class, 'status']);
                Route::post('/install', [\App\Http\Controllers\InstallController::class, 'store']);
            });
    }

    protected function mapApiRoutes(): void
    {
        Route::prefix('api')
            ->middleware('api')
            ->group(base_path('routes/api.php'));
    }
}
