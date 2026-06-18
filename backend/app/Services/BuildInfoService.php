<?php

namespace App\Services;

use Throwable;

class BuildInfoService
{
    public function info(): array
    {
        $manifest = $this->manifest();

        return [
            'version' => (string) ($manifest['version'] ?? env('APP_VERSION', 'dev')),
            'built_at' => $manifest['built_at'] ?? env('APP_BUILD_TIME'),
            'commit' => $manifest['commit'] ?? env('APP_BUILD_COMMIT'),
        ];
    }

    private function manifest(): array
    {
        $path = base_path('build.json');

        if (! is_file($path)) {
            return [];
        }

        try {
            $contents = (string) file_get_contents($path);
            $contents = preg_replace('/^\xEF\xBB\xBF/', '', $contents) ?: $contents;
            $decoded = json_decode($contents, true);

            return is_array($decoded) ? $decoded : [];
        } catch (Throwable $e) {
            return [];
        }
    }
}
