<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        if (app()->environment('testing') && ! config('app.key')) {
            config([
                'app.key' => 'mimo-testing-app-key-32-bytes!!',
                'cache.default' => 'file',
                'session.driver' => 'file',
            ]);
        }
    }

    public function boot(): void
    {
    }
}
