<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Throwable;

class UpdateService
{
    private const DEFAULT_REPOSITORY = 'jinnian0703/mimotts';
    private const DEFAULT_DOCKER_IMAGE = 'ghcr.io/jinnian0703/mimotts';
    private const SOURCE_ASSET_NAMES = [
        'mimotts-source-upload.zip',
        'mimo-source-upload.zip',
    ];

    public function status(): array
    {
        $current = app(BuildInfoService::class)->info();
        $deployment = $this->deployment();
        $latest = $this->latest();
        $updateAvailable = $this->updateAvailable($current, $latest);
        $canExecute = $deployment['mode'] === 'source' && $this->upgradeAllowed();

        return [
            'current' => $current,
            'latest' => $latest,
            'update_available' => $updateAvailable,
            'deployment' => $deployment,
            'executor' => [
                'enabled' => $canExecute,
                'message' => $deployment['mode'] === 'docker'
                    ? 'Docker 模式请在宿主机执行升级命令'
                    : ($canExecute
                        ? '已允许从后台执行升级'
                        : '后台执行升级未开启，将仅生成升级命令'),
            ],
            'commands' => $this->commands($deployment['mode'], $latest),
            'checked_at' => now()->toISOString(),
        ];
    }

    public function upgrade(?string $mode = null): array
    {
        $status = $this->status();
        $mode = $mode ?: $status['deployment']['mode'];
        $commands = $this->commands($mode, $status['latest']);

        if ($mode === 'docker') {
            return [
                'executed' => false,
                'message' => 'Docker 模式请在宿主机执行升级命令，后台仅生成命令。',
                'commands' => $commands,
                'status' => $status,
            ];
        }

        if (! $this->upgradeAllowed()) {
            return [
                'executed' => false,
                'message' => '后台执行升级未开启，请按命令在服务器执行，或在 .env 设置 MIMO_UPDATE_ALLOW_UPGRADE=true。',
                'commands' => $commands,
                'status' => $status,
            ];
        }

        if (empty($commands)) {
            return [
                'executed' => false,
                'message' => '没有可执行的升级命令',
                'commands' => [],
                'status' => $status,
            ];
        }

        $logPath = storage_path('logs/update-'.now()->format('Ymd_His').'.log');
        $script = implode(' && ', $commands);
        $command = 'nohup bash -lc '.escapeshellarg($script).' > '.escapeshellarg($logPath).' 2>&1 & echo $!';

        $output = [];
        $exitCode = 0;
        exec($command, $output, $exitCode);

        if ($exitCode !== 0) {
            return [
                'executed' => false,
                'message' => '升级任务启动失败，请检查 PHP 是否允许 exec。',
                'commands' => $commands,
                'status' => $status,
            ];
        }

        return [
            'executed' => true,
            'message' => '升级任务已启动，请稍后刷新页面查看版本。',
            'pid' => $output[0] ?? null,
            'log_path' => $logPath,
            'commands' => $commands,
            'status' => $status,
        ];
    }

    private function latest(): array
    {
        $manifestUrl = trim((string) env('MIMO_UPDATE_MANIFEST_URL', ''));

        if ($manifestUrl !== '') {
            return $this->latestFromManifest($manifestUrl);
        }

        $manifest = $this->latestFromManifest($this->defaultManifestUrl());
        if (! empty($manifest['ok'])) {
            return $manifest;
        }

        return $this->latestFromGithubRelease();
    }

    private function latestFromManifest(string $url): array
    {
        try {
            $response = Http::timeout(10)
                ->acceptJson()
                ->withHeaders(['User-Agent' => 'MimoTTS-Updater'])
                ->get($url);

            if (! $response->ok()) {
                return $this->latestError('更新清单请求失败：HTTP '.$response->status(), $url);
            }

            $data = $response->json();
            if (! is_array($data)) {
                return $this->latestError('更新清单格式无效', $url);
            }

            return $this->normalizeLatest($data + ['manifest_url' => $url]);
        } catch (Throwable $e) {
            return $this->latestError('更新清单请求失败：'.$e->getMessage(), $url);
        }
    }

    private function latestFromGithubRelease(): array
    {
        $repository = $this->repository();
        $url = 'https://api.github.com/repos/'.$repository.'/releases/latest';

        try {
            $response = Http::timeout(10)
                ->acceptJson()
                ->withHeaders(['User-Agent' => 'MimoTTS-Updater'])
                ->get($url);

            if (! $response->ok()) {
                return $this->latestError('GitHub Release 请求失败：HTTP '.$response->status(), $url);
            }

            $release = $response->json();
            if (! is_array($release)) {
                return $this->latestError('GitHub Release 响应格式无效', $url);
            }

            $assets = $release['assets'] ?? [];
            $manifestAsset = $this->assetByName($assets, 'latest.json');
            if ($manifestAsset && ! empty($manifestAsset['browser_download_url'])) {
                $manifest = $this->latestFromManifest((string) $manifestAsset['browser_download_url']);
                if (! empty($manifest['ok'])) {
                    $manifest['changelog_url'] = $manifest['changelog_url'] ?: ($release['html_url'] ?? null);
                    return $manifest;
                }
            }

            $asset = $this->sourceAsset($assets);
            $version = (string) ($release['tag_name'] ?? '');

            return $this->normalizeLatest([
                'version' => $version,
                'commit' => $release['target_commitish'] ?? null,
                'built_at' => $release['published_at'] ?? null,
                'published_at' => $release['published_at'] ?? null,
                'changelog_url' => $release['html_url'] ?? null,
                'source_zip_url' => $asset['browser_download_url'] ?? null,
                'source_sha256' => $asset['digest'] ?? null,
                'docker_image' => $this->dockerImage($version),
                'migration_required' => false,
                'body' => $release['body'] ?? '',
                'manifest_url' => $url,
            ]);
        } catch (Throwable $e) {
            return $this->latestError('GitHub Release 请求失败：'.$e->getMessage(), $url);
        }
    }

    private function normalizeLatest(array $data): array
    {
        $version = (string) ($data['version'] ?? $data['tag_name'] ?? '');

        return [
            'ok' => $version !== '',
            'version' => $version,
            'commit' => $data['commit'] ?? null,
            'built_at' => $data['built_at'] ?? null,
            'published_at' => $data['published_at'] ?? $data['built_at'] ?? null,
            'changelog_url' => $data['changelog_url'] ?? null,
            'source_zip_url' => $data['source_zip_url'] ?? null,
            'source_sha256' => $data['source_sha256'] ?? null,
            'docker_image' => $data['docker_image'] ?? $this->dockerImage($version),
            'migration_required' => (bool) ($data['migration_required'] ?? false),
            'body' => $data['body'] ?? null,
            'manifest_url' => $data['manifest_url'] ?? null,
            'error' => $version === '' ? '未找到最新版本号' : null,
        ];
    }

    private function latestError(string $message, ?string $url = null): array
    {
        return [
            'ok' => false,
            'version' => null,
            'commit' => null,
            'built_at' => null,
            'published_at' => null,
            'changelog_url' => null,
            'source_zip_url' => null,
            'source_sha256' => null,
            'docker_image' => null,
            'migration_required' => false,
            'body' => null,
            'manifest_url' => $url,
            'error' => $message,
        ];
    }

    private function updateAvailable(array $current, array $latest): bool
    {
        if (empty($latest['ok']) || empty($latest['version'])) {
            return false;
        }

        $currentVersion = (string) ($current['version'] ?? '');
        $currentCommit = (string) ($current['commit'] ?? '');
        $latestVersion = (string) $latest['version'];
        $latestCommit = (string) ($latest['commit'] ?? '');

        if ($currentCommit !== '' && $latestCommit !== '' && $currentCommit === $latestCommit) {
            return false;
        }

        $currentComparable = $this->comparableVersion($currentVersion);
        $latestComparable = $this->comparableVersion($latestVersion);
        if ($currentComparable !== null && $latestComparable !== null) {
            return version_compare($currentComparable, $latestComparable, '<');
        }

        return $currentVersion === '' || $currentVersion !== $latestVersion;
    }

    private function comparableVersion(string $version): ?string
    {
        $version = trim($version);
        if ($version === '') {
            return null;
        }

        if (preg_match('/^v?(\d+(?:\.\d+){1,3})(?:[-+].*)?$/i', $version, $matches) !== 1) {
            return null;
        }

        return $matches[1];
    }

    private function deployment(): array
    {
        $mode = strtolower((string) env('MIMO_DEPLOYMENT_MODE', ''));

        if ($mode !== 'source' && $mode !== 'docker') {
            $mode = $this->detectDeploymentMode();
        }

        return [
            'mode' => $mode,
            'label' => $mode === 'docker' ? 'Docker 版' : '宝塔源码版',
        ];
    }

    private function detectDeploymentMode(): string
    {
        if ($this->canInspectRoot() && is_file('/.dockerenv')) {
            return 'docker';
        }

        return 'source';
    }

    private function canInspectRoot(?string $openBasedir = null): bool
    {
        $openBasedir = $openBasedir ?? (string) ini_get('open_basedir');
        if ($openBasedir === '') {
            return true;
        }

        foreach (explode(PATH_SEPARATOR, $openBasedir) as $path) {
            if (trim($path) === '/') {
                return true;
            }
        }

        return false;
    }

    private function commands(string $mode, array $latest): array
    {
        if ($mode === 'docker') {
            return $this->dockerCommands($latest);
        }

        return $this->sourceCommands($latest);
    }

    private function sourceCommands(array $latest): array
    {
        $zipUrl = (string) ($latest['source_zip_url'] ?? '');
        if ($zipUrl === '' && ! empty($latest['version'])) {
            $zipUrl = 'https://github.com/'.$this->repository().'/releases/download/'.$latest['version'].'/mimotts-source-upload.zip';
        }

        if ($zipUrl === '') {
            return [];
        }

        $target = dirname(base_path());
        $sha256 = (string) ($latest['source_sha256'] ?? '');
        $migration = ! empty($latest['migration_required']) ? '1' : '0';

        return [
            'cd '.escapeshellarg($target),
            'bash backend/scripts/source-upgrade.sh '.escapeshellarg($zipUrl).' '.escapeshellarg($sha256).' '.escapeshellarg($migration),
        ];
    }

    private function dockerCommands(array $latest): array
    {
        $image = (string) ($latest['docker_image'] ?? '');
        if ($image === '') {
            $image = $this->dockerImage((string) ($latest['version'] ?? 'latest'));
        }

        return [
            'sh deploy/docker/upgrade.sh '.escapeshellarg($image),
        ];
    }

    private function sourceAsset($assets): ?array
    {
        if (! is_array($assets)) {
            return null;
        }

        foreach (self::SOURCE_ASSET_NAMES as $name) {
            $asset = $this->assetByName($assets, $name);
            if ($asset) {
                return $asset;
            }
        }

        return null;
    }

    private function assetByName($assets, string $name): ?array
    {
        if (! is_array($assets)) {
            return null;
        }

        foreach ($assets as $asset) {
            if (is_array($asset) && ($asset['name'] ?? '') === $name) {
                return $asset;
            }
        }

        return null;
    }

    private function repository(): string
    {
        return trim((string) env('MIMO_UPDATE_REPOSITORY', self::DEFAULT_REPOSITORY), '/');
    }

    private function defaultManifestUrl(): string
    {
        return 'https://github.com/'.$this->repository().'/releases/latest/download/latest.json';
    }

    private function dockerImage(string $version): string
    {
        $image = trim((string) env('MIMO_UPDATE_DOCKER_IMAGE', self::DEFAULT_DOCKER_IMAGE));
        if ($image === '') {
            $image = self::DEFAULT_DOCKER_IMAGE;
        }

        if (strpos($image, '@') !== false || $this->dockerImageHasTag($image)) {
            return $image;
        }

        $tag = $version !== '' ? $version : 'latest';

        return $image.':'.$tag;
    }

    private function dockerImageHasTag(string $image): bool
    {
        $lastSlash = strrpos($image, '/');
        $lastColon = strrpos($image, ':');

        return $lastColon !== false && ($lastSlash === false || $lastColon > $lastSlash);
    }

    private function upgradeAllowed(): bool
    {
        return filter_var(env('MIMO_UPDATE_ALLOW_UPGRADE', false), FILTER_VALIDATE_BOOLEAN);
    }
}
