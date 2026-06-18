<?php

namespace App\Http\Controllers;

use App\Services\AuditLogger;
use App\Services\InstallService;
use App\Services\MailConfigService;
use App\Services\WebInstallService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Throwable;

class InstallController
{
    public function status(InstallService $install, WebInstallService $webInstall): JsonResponse
    {
        try {
            return response()->json(array_merge($install->status(), $webInstall->status()));
        } catch (Throwable $e) {
            report($e);

            if ($this->looksUnmigrated()) {
                return response()->json($this->uninstalledStatus($webInstall));
            }

            return response()->json($this->configErrorStatus($webInstall));
        }
    }

    public function store(Request $request, InstallService $install, AuditLogger $audit, WebInstallService $webInstall): JsonResponse
    {
        try {
            $installed = $install->isInstalled();
        } catch (Throwable $e) {
            $installed = false;
        }

        if ($installed) {
            return response()->json([
                'error' => [
                    'code' => 'AlreadyInstalled',
                    'message' => '系统已完成安装',
                ],
            ], 409);
        }

        $data = $request->validate([
            'app_url' => ['nullable', 'url', 'max:2048'],
            'frontend_url' => ['nullable', 'url', 'max:2048'],
            'admin_name' => ['required', 'string', 'max:255'],
            'admin_email' => ['required', 'email', 'max:255'],
            'admin_password' => ['required', 'string', 'min:8', 'max:128', 'confirmed'],
            'db_connection' => ['nullable', 'in:sqlite,mysql'],
            'db_host' => ['nullable', 'string', 'max:255'],
            'db_port' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'db_database' => ['nullable', 'string', 'max:4096'],
            'db_username' => ['nullable', 'string', 'max:255'],
            'db_password' => ['nullable', 'string', 'max:4096'],
            'linuxdo_client_id' => ['nullable', 'string', 'max:255'],
            'linuxdo_client_secret' => ['nullable', 'string', 'max:4096'],
            'linuxdo_redirect_uri' => ['nullable', 'url', 'max:2048'],
            'mimo_api_key' => ['nullable', 'string', 'max:4096'],
            'mimo_base_url' => ['nullable', 'url', 'max:2048'],
            'email_login_enabled' => ['sometimes', 'boolean'],
            'email_auth' => ['nullable', 'array'],
            'email_auth.enabled' => ['sometimes', 'boolean'],
            'email_auth.verification_required' => ['sometimes', 'boolean'],
            'email_auth.driver' => ['nullable', 'in:smtp,api'],
            'email_auth.smtp_host' => ['nullable', 'string', 'max:255'],
            'email_auth.smtp_port' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'email_auth.smtp_username' => ['nullable', 'string', 'max:255'],
            'email_auth.smtp_password' => ['nullable', 'string', 'max:4096'],
            'email_auth.smtp_encryption' => ['nullable', 'in:tls,ssl,starttls,none'],
            'email_auth.mail_api_provider' => ['nullable', 'in:generic_json,resend'],
            'email_auth.mail_api_endpoint' => ['nullable', 'url', 'max:2048'],
            'email_auth.mail_api_token' => ['nullable', 'string', 'max:4096'],
            'email_auth.mail_from_address' => ['nullable', 'email', 'max:255'],
            'email_auth.mail_from_name' => ['nullable', 'string', 'max:255'],
            'email_auth.verification_subject' => ['nullable', 'string', 'max:160'],
            'email_auth.verification_body' => ['nullable', 'string', 'max:5000'],
            'email_auth.two_factor_subject' => ['nullable', 'string', 'max:160'],
            'email_auth.two_factor_body' => ['nullable', 'string', 'max:5000'],
            'smtp_host' => ['nullable', 'string', 'max:255'],
            'smtp_port' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'smtp_username' => ['nullable', 'string', 'max:255'],
            'smtp_password' => ['nullable', 'string', 'max:4096'],
            'smtp_encryption' => ['nullable', 'in:tls,ssl,starttls,none'],
            'mail_api_provider' => ['nullable', 'in:generic_json,resend'],
            'mail_api_endpoint' => ['nullable', 'url', 'max:2048'],
            'mail_api_token' => ['nullable', 'string', 'max:4096'],
            'mail_from_address' => ['nullable', 'email', 'max:255'],
            'mail_from_name' => ['nullable', 'string', 'max:255'],
        ]);

        $emailAuth = $data['email_auth'] ?? [];
        $baseUrl = $this->baseUrl($request);
        $linuxDoRedirectUri = $data['linuxdo_redirect_uri'] ?? $this->defaultLinuxDoRedirectUri($request, $baseUrl);

        try {
            $admin = $webInstall->install([
                'app_url' => $data['app_url'] ?? $baseUrl,
                'frontend_url' => $data['frontend_url'] ?? $baseUrl,
                'admin_name' => $data['admin_name'],
                'admin_email' => $data['admin_email'],
                'admin_password' => $data['admin_password'],
                'db_connection' => $data['db_connection'] ?? config('database.default'),
                'db_host' => $data['db_host'] ?? config('database.connections.mysql.host'),
                'db_port' => $data['db_port'] ?? config('database.connections.mysql.port'),
                'db_database' => $data['db_database'] ?? config('database.connections.'.config('database.default').'.database'),
                'db_username' => $data['db_username'] ?? config('database.connections.mysql.username'),
                'db_password' => $data['db_password'] ?? '',
                'linuxdo_client_id' => $data['linuxdo_client_id'] ?? '',
                'linuxdo_client_secret' => $data['linuxdo_client_secret'] ?? '',
                'linuxdo_redirect_uri' => $linuxDoRedirectUri,
                'mimo_api_key' => $data['mimo_api_key'] ?? '',
                'mimo_base_url' => $data['mimo_base_url'] ?? 'https://api.xiaomimimo.com/v1',
                'email_config' => [
                    'enabled' => true,
                    'verification_required' => (bool) ($emailAuth['verification_required'] ?? false),
                    'driver' => $emailAuth['driver'] ?? 'smtp',
                    'smtp' => [
                        'host' => $emailAuth['smtp_host'] ?? $data['smtp_host'] ?? null,
                        'port' => $emailAuth['smtp_port'] ?? $data['smtp_port'] ?? null,
                        'username' => $emailAuth['smtp_username'] ?? $data['smtp_username'] ?? null,
                        'password' => $emailAuth['smtp_password'] ?? $data['smtp_password'] ?? null,
                        'encryption' => $emailAuth['smtp_encryption'] ?? $data['smtp_encryption'] ?? null,
                    ],
                    'api' => [
                        'provider' => $emailAuth['mail_api_provider'] ?? $data['mail_api_provider'] ?? 'generic_json',
                        'endpoint' => $emailAuth['mail_api_endpoint'] ?? $data['mail_api_endpoint'] ?? null,
                        'token' => $emailAuth['mail_api_token'] ?? $data['mail_api_token'] ?? null,
                    ],
                    'sender' => [
                        'address' => $emailAuth['mail_from_address'] ?? $data['mail_from_address'] ?? null,
                        'name' => $emailAuth['mail_from_name'] ?? $data['mail_from_name'] ?? null,
                    ],
                    'templates' => [
                        'verification' => [
                            'subject' => $emailAuth['verification_subject'] ?? null,
                            'body' => $emailAuth['verification_body'] ?? null,
                        ],
                        'two_factor' => [
                            'subject' => $emailAuth['two_factor_subject'] ?? null,
                            'body' => $emailAuth['two_factor_body'] ?? null,
                        ],
                    ],
                ],
                'mail_host' => $emailAuth['smtp_host'] ?? $data['smtp_host'] ?? '',
                'mail_port' => $emailAuth['smtp_port'] ?? $data['smtp_port'] ?? 587,
                'mail_username' => $emailAuth['smtp_username'] ?? $data['smtp_username'] ?? '',
                'mail_password' => $emailAuth['smtp_password'] ?? $data['smtp_password'] ?? '',
                'mail_encryption' => $emailAuth['smtp_encryption'] ?? $data['smtp_encryption'] ?? 'tls',
                'mail_from_address' => $emailAuth['mail_from_address'] ?? $data['mail_from_address'] ?? '',
                'mail_from_name' => $emailAuth['mail_from_name'] ?? $data['mail_from_name'] ?? 'MimoTTS',
            ]);
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'error' => [
                    'code' => 'InstallFailed',
                    'message' => '安装失败，请检查配置',
                ],
            ], 422);
        }

        try {
            $audit->recordForUser($admin, $request, 'install.complete');
        } catch (Throwable $e) {
            report($e);
        }

        return response()->json([
            'installed' => true,
            'user' => $admin->fresh(),
        ], 201);
    }

    public function emailAuthConfig(InstallService $install): JsonResponse
    {
        return response()->json([
            'config' => $install->emailAuthConfig(),
        ]);
    }

    public function updateEmailAuthConfig(Request $request, InstallService $install, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'enabled' => ['sometimes', 'boolean'],
            'registration_enabled' => ['sometimes', 'boolean'],
            'verification_required' => ['sometimes', 'boolean'],
            'linuxdo_enabled' => ['sometimes', 'boolean'],
            'linuxdo_client_id' => ['nullable', 'string', 'max:255'],
            'linuxdo_client_secret' => ['nullable', 'string', 'max:4096'],
            'linuxdo_redirect_uri' => ['nullable', 'url', 'max:2048'],
            'driver' => ['nullable', 'in:smtp,api'],
            'smtp_host' => ['nullable', 'string', 'max:255'],
            'smtp_port' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'smtp_username' => ['nullable', 'string', 'max:255'],
            'smtp_password' => ['nullable', 'string', 'max:4096'],
            'smtp_encryption' => ['nullable', 'in:tls,ssl,starttls,none'],
            'mail_api_provider' => ['nullable', 'in:generic_json,resend'],
            'mail_api_endpoint' => ['nullable', 'url', 'max:2048'],
            'mail_api_token' => ['nullable', 'string', 'max:4096'],
            'mail_from_address' => ['nullable', 'email', 'max:255'],
            'mail_from_name' => ['nullable', 'string', 'max:255'],
            'verification_subject' => ['nullable', 'string', 'max:160'],
            'verification_body' => ['nullable', 'string', 'max:5000'],
            'two_factor_subject' => ['nullable', 'string', 'max:160'],
            'two_factor_body' => ['nullable', 'string', 'max:5000'],
        ]);

        $current = $install->emailAuthConfigForUpdate();
        $currentSmtp = $current['smtp'] ?? [];
        $currentApi = $current['api'] ?? [];
        $currentSender = $current['sender'] ?? [];
        $currentTemplates = $current['templates'] ?? [];
        $currentLinuxDo = $install->linuxDoConfigForUpdate();
        $install->setEmailAuthConfig([
            'enabled' => array_key_exists('enabled', $data) ? $request->boolean('enabled') : (bool) ($current['enabled'] ?? false),
            'registration_enabled' => array_key_exists('registration_enabled', $data) ? $request->boolean('registration_enabled') : (bool) ($current['registration_enabled'] ?? true),
            'verification_required' => array_key_exists('verification_required', $data) ? $request->boolean('verification_required') : (bool) ($current['verification_required'] ?? false),
            'driver' => $data['driver'] ?? ($current['driver'] ?? 'smtp'),
            'smtp' => [
                'host' => $data['smtp_host'] ?? ($currentSmtp['host'] ?? null),
                'port' => $data['smtp_port'] ?? ($currentSmtp['port'] ?? null),
                'username' => $data['smtp_username'] ?? ($currentSmtp['username'] ?? null),
                'password' => ! empty($data['smtp_password']) ? $data['smtp_password'] : ($currentSmtp['password'] ?? null),
                'encryption' => $data['smtp_encryption'] ?? ($currentSmtp['encryption'] ?? null),
            ],
            'api' => [
                'provider' => $data['mail_api_provider'] ?? ($currentApi['provider'] ?? 'generic_json'),
                'endpoint' => $data['mail_api_endpoint'] ?? ($currentApi['endpoint'] ?? null),
                'token' => ! empty($data['mail_api_token']) ? $data['mail_api_token'] : ($currentApi['token'] ?? null),
            ],
            'sender' => [
                'address' => $data['mail_from_address'] ?? ($currentSender['address'] ?? null),
                'name' => $data['mail_from_name'] ?? ($currentSender['name'] ?? null),
            ],
            'templates' => [
                'verification' => [
                    'subject' => array_key_exists('verification_subject', $data) ? $data['verification_subject'] : ($currentTemplates['verification']['subject'] ?? null),
                    'body' => array_key_exists('verification_body', $data) ? $data['verification_body'] : ($currentTemplates['verification']['body'] ?? null),
                ],
                'two_factor' => [
                    'subject' => array_key_exists('two_factor_subject', $data) ? $data['two_factor_subject'] : ($currentTemplates['two_factor']['subject'] ?? null),
                    'body' => array_key_exists('two_factor_body', $data) ? $data['two_factor_body'] : ($currentTemplates['two_factor']['body'] ?? null),
                ],
            ],
        ]);
        $install->setLinuxDoConfig([
            'enabled' => array_key_exists('linuxdo_enabled', $data) ? $request->boolean('linuxdo_enabled') : (bool) ($currentLinuxDo['enabled'] ?? true),
            'client_id' => array_key_exists('linuxdo_client_id', $data) ? ($data['linuxdo_client_id'] ?? null) : ($currentLinuxDo['client_id'] ?? null),
            'client_secret' => ! empty($data['linuxdo_client_secret']) ? $data['linuxdo_client_secret'] : ($currentLinuxDo['client_secret'] ?? null),
            'redirect_uri' => array_key_exists('linuxdo_redirect_uri', $data) ? ($data['linuxdo_redirect_uri'] ?? null) : ($currentLinuxDo['redirect_uri'] ?? null),
        ]);
        $audit->record($request, 'email_auth_config.update');

        return response()->json([
            'config' => $install->emailAuthConfig(),
        ]);
    }

    public function testEmailAuthConfig(
        Request $request,
        InstallService $install,
        MailConfigService $mailConfig,
        AuditLogger $audit
    ): JsonResponse {
        $data = $request->validate([
            'to' => ['nullable', 'email', 'max:255'],
            'driver' => ['nullable', 'in:smtp,api'],
            'smtp_host' => ['nullable', 'string', 'max:255'],
            'smtp_port' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'smtp_username' => ['nullable', 'string', 'max:255'],
            'smtp_password' => ['nullable', 'string', 'max:4096'],
            'smtp_encryption' => ['nullable', 'in:tls,ssl,starttls,none'],
            'mail_api_provider' => ['nullable', 'in:generic_json,resend'],
            'mail_api_endpoint' => ['nullable', 'url', 'max:2048'],
            'mail_api_token' => ['nullable', 'string', 'max:4096'],
            'mail_from_address' => ['nullable', 'email', 'max:255'],
            'mail_from_name' => ['nullable', 'string', 'max:255'],
        ]);

        $current = $install->emailAuthConfigForUpdate();
        $currentSmtp = $current['smtp'] ?? [];
        $currentApi = $current['api'] ?? [];
        $currentSender = $current['sender'] ?? [];
        $recipient = $data['to'] ?? $request->user()->email;

        if (! $recipient) {
            return response()->json([
                'error' => [
                    'code' => 'TestRecipientMissing',
                    'message' => '测试收件邮箱不能为空',
                ],
            ], 422);
        }

        $emailConfig = [
            'driver' => $data['driver'] ?? ($current['driver'] ?? 'smtp'),
            'smtp' => [
                'host' => $data['smtp_host'] ?? ($currentSmtp['host'] ?? null),
                'port' => $data['smtp_port'] ?? ($currentSmtp['port'] ?? null),
                'username' => $data['smtp_username'] ?? ($currentSmtp['username'] ?? null),
                'password' => ! empty($data['smtp_password']) ? $data['smtp_password'] : ($currentSmtp['password'] ?? null),
                'encryption' => $data['smtp_encryption'] ?? ($currentSmtp['encryption'] ?? null),
            ],
            'api' => [
                'provider' => $data['mail_api_provider'] ?? ($currentApi['provider'] ?? 'generic_json'),
                'endpoint' => $data['mail_api_endpoint'] ?? ($currentApi['endpoint'] ?? null),
                'token' => ! empty($data['mail_api_token']) ? $data['mail_api_token'] : ($currentApi['token'] ?? null),
            ],
            'sender' => [
                'address' => $data['mail_from_address'] ?? ($currentSender['address'] ?? null),
                'name' => $data['mail_from_name'] ?? ($currentSender['name'] ?? null),
            ],
        ];

        try {
            $mailConfig->send(
                $emailConfig,
                $recipient,
                '邮件投递测试',
                "邮件投递测试发送成功。\n\n时间：".now()->timezone(config('app.task_timezone', 'Asia/Shanghai'))->format('Y-m-d H:i:s')
            );
        } catch (Throwable $e) {
            report($e);

            return response()->json([
                'error' => [
                    'code' => 'EmailAuthTestFailed',
                    'message' => '测试邮件发送失败，请检查邮件配置',
                ],
            ], 422);
        }

        $audit->record($request, 'email_auth_config.test', null, null, [
            'recipient' => $recipient,
        ]);

        return response()->json([
            'sent' => true,
            'message' => '测试邮件已发送',
        ]);
    }

    private function baseUrl(Request $request): string
    {
        $scheme = $request->headers->get('x-forwarded-proto') ?: $request->getScheme();

        return $scheme.'://'.$request->getHttpHost();
    }

    private function defaultLinuxDoRedirectUri(Request $request, string $baseUrl): string
    {
        $scriptName = (string) $request->server('SCRIPT_NAME', '');
        $path = basename($scriptName) === 'api.php'
            ? '/api.php?r=/auth/linuxdo/callback'
            : '/api/auth/linuxdo/callback';

        return rtrim($baseUrl, '/').$path;
    }

    private function uninstalledStatus(WebInstallService $webInstall): array
    {
        return array_merge([
            'installed' => false,
            'install_state' => InstallService::STATE_UNINSTALLED,
            'installState' => InstallService::STATE_UNINSTALLED,
            'state_message' => '系统未安装',
            'stateMessage' => '系统未安装',
            'missing_config' => [],
            'missingConfig' => [],
            'build' => app(\App\Services\BuildInfoService::class)->info(),
            'admin_bound' => false,
            'administratorBound' => false,
            'mimo_configured' => false,
            'linuxdo_configured' => false,
            'linuxDoConfigured' => false,
            'linuxdo_login_enabled' => false,
            'linuxDoLoginEnabled' => false,
            'registration_enabled' => true,
            'registrationEnabled' => true,
            'email_login_enabled' => false,
            'email_auth_enabled' => false,
            'emailLoginEnabled' => false,
            'emailAuthEnabled' => false,
            'email_auth' => [
                'enabled' => false,
                'registration_enabled' => true,
                'verification_required' => false,
                'smtp_configured' => false,
                'sender_configured' => false,
                'linuxdo' => [
                    'enabled' => true,
                    'client_id' => null,
                    'client_secret_configured' => false,
                    'redirect_uri' => null,
                    'configured' => false,
                ],
            ],
        ], $webInstall->status());
    }

    private function configErrorStatus(WebInstallService $webInstall): array
    {
        return array_merge($this->uninstalledStatus($webInstall), [
            'install_state' => InstallService::STATE_CONFIG_ERROR,
            'installState' => InstallService::STATE_CONFIG_ERROR,
            'state_message' => '系统配置读取异常，请检查 APP_KEY、数据库和已保存的加密配置',
            'stateMessage' => '系统配置读取异常，请检查 APP_KEY、数据库和已保存的加密配置',
            'config_error' => true,
            'configError' => true,
        ]);
    }

    private function looksUnmigrated(): bool
    {
        try {
            return ! Schema::hasTable('users') || ! Schema::hasTable('system_settings');
        } catch (Throwable $e) {
            return false;
        }
    }

}
