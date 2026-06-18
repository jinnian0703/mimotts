<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        if (app()->environment('testing') && ! config('app.key')) {
            config([
                'app.key' => 'base64:'.base64_encode(random_bytes(32)),
                'cache.default' => 'file',
                'session.driver' => 'file',
            ]);
        }
    }

    public function boot(): void
    {
    }
}
