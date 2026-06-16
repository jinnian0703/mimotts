<?php

use Illuminate\Support\Facades\Artisan;

Artisan::command('about:mimo', function (): void {
    $this->info('MimoTTS API backend');
});
