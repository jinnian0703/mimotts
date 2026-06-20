<?php

namespace App\Services;

use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class LinuxDoOAuthService
{
    private $http;

    public function __construct(HttpFactory $http)
    {
        $this->http = $http;
    }

    public function authorizationUrl(string $state, ?string $redirectUri = null): string
    {
        $config = $this->resolvedConfig($redirectUri);

        if (! $this->hasOAuthCredentials($config)) {
            throw new RuntimeException('LinuxDo Connect 未配置');
        }

        return $this->urlWithQuery($config['authorize_url'], [
            'client_id' => $config['client_id'],
            'redirect_uri' => $config['redirect_uri'],
            'response_type' => 'code',
            'scope' => implode(' ', Arr::wrap($config['scopes'])),
            'state' => $state,
        ]);
    }

    public function fetchUser(string $code, ?string $redirectUri = null): array
    {
        $config = $this->resolvedConfig($redirectUri);

        if (! $this->hasOAuthCredentials($config)) {
            throw new RuntimeException('LinuxDo Connect 未配置');
        }

        $token = $this->http->asForm()->post($config['token_url'], [
            'grant_type' => 'authorization_code',
            'client_id' => $config['client_id'],
            'client_secret' => $config['client_secret'],
            'redirect_uri' => $config['redirect_uri'],
            'code' => $code,
        ]);

        if (! $token->successful()) {
            throw new RuntimeException('LinuxDo 登录凭证交换失败');
        }

        $accessToken = $token->json('access_token');
        if (! $accessToken) {
            throw new RuntimeException('LinuxDo 登录响应缺少访问令牌');
        }

        $profile = $this->http
            ->withToken($accessToken)
            ->acceptJson()
            ->get($config['userinfo_url']);

        if (! $profile->successful()) {
            throw new RuntimeException('LinuxDo 用户信息获取失败');
        }

        return $profile->json();
    }

    public function configured(): bool
    {
        return $this->hasOAuthClientCredentials($this->resolvedConfig());
    }

    public function redirectUriForRequest(Request $request): string
    {
        $path = basename((string) $request->server('SCRIPT_NAME', '')) === 'api.php'
            ? '/api.php?r=/auth/linuxdo/callback'
            : '/api/auth/linuxdo/callback';

        return $this->requestBaseUrl($request).$path;
    }

    public function frontendUrlForRequest(Request $request): string
    {
        $baseUrl = $this->requestBaseUrl($request);
        $headerUrl = $this->frontendUrlFromHeaders($request);

        if ($headerUrl !== '') {
            return rtrim($headerUrl, '/');
        }

        return rtrim($baseUrl, '/');
    }

    public function existingUser(array $profile): ?User
    {
        $linuxdoId = $this->profileId($profile);

        return User::where('linuxdo_id', $linuxdoId)->first();
    }

    public function syncUser(array $profile): User
    {
        $linuxdoId = $this->profileId($profile);

        $email = Arr::get($profile, 'email');
        $email = is_string($email) && $email !== '' ? Str::lower($email) : null;

        $billing = app(BillingConfigService::class);
        $defaultPlan = $billing->defaultPlan();
        $user = User::where('linuxdo_id', $linuxdoId)->first();
        $planId = $user ? $user->plan_id : ($defaultPlan['id'] ?? null);

        $syncedUser = User::updateOrCreate(
            ['linuxdo_id' => $linuxdoId],
            [
                'name' => Arr::get($profile, 'name')
                    ?? Arr::get($profile, 'username')
                    ?? 'LinuxDo 用户 '.Str::limit($linuxdoId, 8, ''),
                'email' => $email,
                'email_verified_at' => $email ? now() : null,
                'avatar_url' => Arr::get($profile, 'picture') ?? Arr::get($profile, 'avatar_url'),
                'status' => $user ? ($user->status ?: 'active') : 'active',
                'plan_id' => $planId,
                'last_login_at' => now(),
            ]
        );

        if ($syncedUser->wasRecentlyCreated) {
            app(QuotaService::class)->grantDefaultPlan($syncedUser, $defaultPlan);
            $syncedUser->refresh();
        }

        return $syncedUser;
    }

    public function profileId(array $profile): string
    {
        $linuxdoId = (string) (Arr::get($profile, 'sub') ?? Arr::get($profile, 'id'));
        if ($linuxdoId === '') {
            throw new RuntimeException('LinuxDo 用户信息缺少用户标识');
        }

        return $linuxdoId;
    }

    private function resolvedConfig(?string $redirectUri = null): array
    {
        $service = config('services.linuxdo', []);
        $stored = $this->storedConfig();

        return [
            'enabled' => array_key_exists('enabled', $stored) ? (bool) $stored['enabled'] : true,
            'client_id' => $stored['client_id'] ?? $service['client_id'] ?? null,
            'client_secret' => $stored['client_secret'] ?? $service['client_secret'] ?? null,
            'redirect_uri' => $redirectUri ?: ($stored['redirect_uri'] ?? $service['redirect_uri'] ?? null),
            'authorize_url' => $service['authorize_url'] ?? 'https://connect.linux.do/oauth2/authorize',
            'token_url' => $service['token_url'] ?? 'https://connect.linux.do/oauth2/token',
            'userinfo_url' => $service['userinfo_url'] ?? 'https://connect.linux.do/api/user',
            'scopes' => $service['scopes'] ?? ['openid', 'profile', 'email'],
        ];
    }

    private function storedConfig(): array
    {
        try {
            $setting = SystemSetting::where('key', InstallService::LINUXDO_AUTH_KEY)->first();
            $value = $setting ? $setting->decodedValue() : null;

            return is_array($value) ? $value : [];
        } catch (Throwable $e) {
            return [];
        }
    }

    private function hasOAuthCredentials(array $config): bool
    {
        return $this->hasOAuthClientCredentials($config)
            && ! empty($config['redirect_uri']);
    }

    private function hasOAuthClientCredentials(array $config): bool
    {
        return ! empty($config['enabled'])
            && ! empty($config['client_id'])
            && ! empty($config['client_secret']);
    }

    private function requestBaseUrl(Request $request): string
    {
        $scheme = (string) ($request->headers->get('x-forwarded-proto') ?: $request->getScheme());
        $host = (string) ($request->headers->get('x-forwarded-host') ?: $request->getHttpHost());

        $scheme = trim(explode(',', $scheme)[0]) ?: 'http';
        $host = trim(explode(',', $host)[0]);

        return $scheme.'://'.$host;
    }

    private function frontendUrlFromHeaders(Request $request): string
    {
        $origin = trim((string) $request->headers->get('origin'));
        if ($this->isHttpUrl($origin)) {
            return $origin;
        }

        $referer = trim((string) $request->headers->get('referer'));
        if (! $this->isHttpUrl($referer)) {
            return '';
        }

        $parts = parse_url($referer);
        if (! is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            return '';
        }

        $port = isset($parts['port']) ? ':'.$parts['port'] : '';

        return $parts['scheme'].'://'.$parts['host'].$port;
    }

    private function isHttpUrl(string $url): bool
    {
        if ($url === '') {
            return false;
        }

        $scheme = parse_url($url, PHP_URL_SCHEME);

        return $scheme === 'http' || $scheme === 'https';
    }

    private function urlWithQuery(string $url, array $query): string
    {
        $separator = strpos($url, '?') === false ? '?' : '&';

        return $url.$separator.http_build_query($query, '', '&', PHP_QUERY_RFC3986);
    }
}
