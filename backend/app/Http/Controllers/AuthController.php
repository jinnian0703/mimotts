<?php

namespace App\Http\Controllers;

use App\Models\SystemSetting;
use App\Models\User;
use App\Services\AccountSecurityService;
use App\Services\AuditLogger;
use App\Services\BillingConfigService;
use App\Services\EmailVerificationService;
use App\Services\InstallService;
use App\Services\LinuxDoOAuthService;
use App\Services\QuotaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Throwable;

class AuthController
{
    public function redirect(Request $request, LinuxDoOAuthService $oauth): JsonResponse
    {
        if (! $oauth->configured()) {
            return response()->json([
                'error' => [
                    'code' => 'LinuxDoConnectDisabled',
                    'message' => 'LinuxDo Connect 未配置',
                ],
            ], 403);
        }

        $state = Str::random(40);
        $request->session()->put('linuxdo_oauth_state', $state);
        $request->session()->forget(['linuxdo_oauth_mode', 'linuxdo_oauth_user_id']);

        return response()->json([
            'authorize_url' => $oauth->authorizationUrl($state),
        ]);
    }

    public function callback(Request $request, LinuxDoOAuthService $oauth, InstallService $install, AuditLogger $audit)
    {
        $request->validate([
            'code' => ['required', 'string'],
            'state' => ['required', 'string'],
        ]);

        if (! hash_equals((string) $request->session()->pull('linuxdo_oauth_state'), (string) $request->query('state'))) {
            throw new RuntimeException('登录状态校验失败');
        }

        $profile = $oauth->fetchUser($request->query('code'));
        if ($request->session()->pull('linuxdo_oauth_mode') === 'bind') {
            return $this->bindLinuxDo($request, $oauth, $audit, $profile);
        }

        if (! $this->registrationEnabled($install) && ! $oauth->existingUser($profile)) {
            return response()->json([
                'error' => [
                    'code' => 'RegistrationDisabled',
                    'message' => '系统暂未开放注册',
                ],
            ], 403);
        }

        $user = $oauth->syncUser($profile);

        if ($user->status === 'suspended') {
            return response()->json([
                'error' => [
                    'code' => 'AccountSuspended',
                    'message' => '账号已暂停',
                ],
            ], 403);
        }

        Auth::login($user, true);
        $request->session()->regenerate();
        $audit->recordForUser($user, $request, 'auth.login', ['provider' => 'linuxdo']);

        $frontendUrl = $this->frontendUrl();
        if ($request->expectsJson()) {
            return response()->json(['user' => $user]);
        }

        return redirect()->away($frontendUrl.'/');
    }

    private function bindLinuxDo(Request $request, LinuxDoOAuthService $oauth, AuditLogger $audit, array $profile)
    {
        $userId = $request->session()->pull('linuxdo_oauth_user_id');
        $user = $request->user() ?: User::query()->find($userId);
        $frontendUrl = $this->frontendUrl();

        if (! $user || (string) $user->id !== (string) $userId) {
            return $request->expectsJson()
                ? response()->json([
                    'error' => [
                        'code' => 'LinuxDoBindSessionExpired',
                        'message' => '绑定会话已失效，请重新登录后再绑定',
                    ],
                ], 419)
                : redirect()->away($frontendUrl.'/settings?linuxdo_bind=expired');
        }

        $linuxdoId = $oauth->profileId($profile);
        $existingUser = User::query()
            ->where('linuxdo_id', $linuxdoId)
            ->where('id', '<>', $user->id)
            ->first();

        if ($existingUser) {
            return $request->expectsJson()
                ? response()->json([
                    'error' => [
                        'code' => 'LinuxDoAlreadyLinked',
                        'message' => '该 LinuxDo 账号已绑定其他用户',
                    ],
                ], 422)
                : redirect()->away($frontendUrl.'/settings?linuxdo_bind=conflict');
        }

        $user->forceFill([
            'linuxdo_id' => $linuxdoId,
            'avatar_url' => $user->avatar_url ?: ($profile['picture'] ?? $profile['avatar_url'] ?? null),
        ])->save();

        $audit->recordForUser($user, $request, 'account.linuxdo.link');

        if ($request->expectsJson()) {
            return response()->json(['user' => $user->fresh()]);
        }

        return redirect()->away($frontendUrl.'/settings?linuxdo_bind=success');
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'user' => $request->user(),
        ]);
    }

    public function logout(Request $request, AuditLogger $audit): JsonResponse
    {
        $audit->record($request, 'auth.logout');

        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

    public function emailRegister(Request $request, InstallService $install, EmailVerificationService $verification, AuditLogger $audit, BillingConfigService $billing, QuotaService $quota): JsonResponse
    {
        if ($response = $this->emailAuthUnavailable($install)) {
            return $response;
        }

        if (! $this->registrationEnabled($install)) {
            return response()->json([
                'error' => [
                    'code' => 'RegistrationDisabled',
                    'message' => '系统暂未开放注册',
                ],
            ], 403);
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string', 'max:128', 'confirmed', Password::min(8)],
        ]);

        $email = Str::lower($data['email']);
        $existingUser = $this->emailUserQuery($email)->first();

        if ($existingUser) {
            throw ValidationException::withMessages([
                'email' => ['邮箱已被注册'],
            ]);
        }

        $emailConfig = $install->emailAuthConfigForUpdate();
        $verificationRequired = (bool) ($emailConfig['verification_required'] ?? false);
        $defaultPlan = $billing->defaultPlan();

        $user = User::create([
            'name' => $data['name'],
            'email' => $email,
            'password' => $data['password'],
            'email_verified_at' => $verificationRequired ? null : now(),
            'status' => 'active',
            'plan_id' => $defaultPlan['id'] ?? null,
            'last_login_at' => $verificationRequired ? null : now(),
        ]);
        $quota->grantDefaultPlan($user, $defaultPlan);
        $user->refresh();

        if ($verificationRequired) {
            try {
                $verification->issue($user, $emailConfig);
            } catch (Throwable $e) {
                $user->delete();

                return response()->json([
                    'error' => [
                        'code' => 'VerificationMailFailed',
                        'message' => '验证邮件发送失败',
                    ],
                ], 422);
            }
            $audit->recordForUser($user, $request, 'auth.register_verification_sent', ['provider' => 'email']);

            return response()->json([
                'verification_required' => true,
                'message' => '验证邮件已发送',
            ], 201);
        }

        Auth::login($user, true);
        $request->session()->regenerate();
        $audit->recordForUser($user, $request, 'auth.register', ['provider' => 'email']);

        return response()->json([
            'user' => $user->fresh(),
        ], 201);
    }

    public function emailLogin(Request $request, InstallService $install, AccountSecurityService $security, AuditLogger $audit): JsonResponse
    {
        if (! $install->isInstalled()) {
            return response()->json([
                'error' => [
                    'code' => 'InstallationRequired',
                    'message' => '系统尚未完成安装',
                ],
            ], 409);
        }

        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string', 'max:128'],
        ]);

        $email = Str::lower($data['email']);
        $user = $this->emailUserQuery($email)->whereNotNull('password')->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            $audit->recordForUser($user, $request, 'auth.login_failed', ['provider' => 'email']);

            return response()->json([
                'error' => [
                    'code' => 'InvalidCredentials',
                    'message' => '邮箱或密码不正确',
                ],
            ], 401);
        }

        $emailConfig = $install->emailAuthConfig();
        if (! $emailConfig['enabled'] && ! $user->is_admin) {
            return response()->json([
                'error' => [
                    'code' => 'EmailLoginDisabled',
                    'message' => '邮箱登录未启用',
                ],
            ], 403);
        }

        if ($user->status === 'suspended') {
            return response()->json([
                'error' => [
                    'code' => 'AccountSuspended',
                    'message' => '账号已暂停',
                ],
            ], 403);
        }

        if ($emailConfig['verification_required'] && ! $user->email_verified_at) {
            return response()->json([
                'error' => [
                    'code' => 'EmailNotVerified',
                    'message' => '邮箱尚未验证',
                ],
            ], 403);
        }

        if ($user->two_factor_enabled) {
            try {
                $security->issueTwoFactorCode($user, $install->emailAuthConfigForUpdate());
            } catch (Throwable $e) {
                return response()->json([
                    'error' => [
                        'code' => 'TwoFactorMailFailed',
                        'message' => $e->getMessage() ?: '验证码发送失败',
                    ],
                ], 422);
            }

            $request->session()->put('two_factor_user_id', $user->id);
            $request->session()->put('two_factor_email', $email);
            $audit->recordForUser($user, $request, 'auth.two_factor_challenge', ['provider' => 'email']);

            return response()->json([
                'two_factor_required' => true,
                'email' => $user->email,
            ]);
        }

        $user->forceFill(['last_login_at' => now()])->save();
        Auth::login($user, true);
        $request->session()->regenerate();
        $audit->recordForUser($user, $request, 'auth.login', ['provider' => 'email']);

        return response()->json([
            'user' => $user->fresh(),
        ]);
    }

    public function emailTwoFactor(Request $request, AccountSecurityService $security, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'code' => ['required', 'string', 'size:6'],
        ]);

        $pendingUserId = $request->session()->get('two_factor_user_id');
        $pendingEmail = $request->session()->get('two_factor_email');
        $email = Str::lower($data['email']);

        if (! $pendingUserId || ! hash_equals((string) $pendingEmail, $email)) {
            return response()->json([
                'error' => [
                    'code' => 'TwoFactorSessionExpired',
                    'message' => '验证会话已失效',
                ],
            ], 419);
        }

        $user = User::query()->find($pendingUserId);
        if (! $user || Str::lower((string) $user->email) !== $email) {
            return response()->json([
                'error' => [
                    'code' => 'TwoFactorSessionExpired',
                    'message' => '验证会话已失效',
                ],
            ], 419);
        }

        if ($user->status === 'suspended') {
            return response()->json([
                'error' => [
                    'code' => 'AccountSuspended',
                    'message' => '账号已暂停',
                ],
            ], 403);
        }

        if (! $security->verifyTwoFactorCode($user, $data['code'])) {
            return response()->json([
                'error' => [
                    'code' => 'InvalidTwoFactorCode',
                    'message' => '验证码无效或已过期',
                ],
            ], 422);
        }

        $request->session()->forget(['two_factor_user_id', 'two_factor_email']);
        $user->forceFill(['last_login_at' => now()])->save();
        Auth::login($user, true);
        $request->session()->regenerate();
        $audit->recordForUser($user, $request, 'auth.login', ['provider' => 'email', 'two_factor' => true]);

        return response()->json([
            'user' => $user->fresh(),
        ]);
    }

    public function emailVerify(Request $request, EmailVerificationService $verification, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'token' => ['required', 'string', 'max:120'],
        ]);

        $user = $verification->verify($data['email'], $data['token']);
        if (! $user) {
            return response()->json([
                'error' => [
                    'code' => 'InvalidVerificationToken',
                    'message' => '验证链接无效或已过期',
                ],
            ], 422);
        }

        Auth::login($user, true);
        $request->session()->regenerate();
        $audit->recordForUser($user, $request, 'auth.email_verified', ['provider' => 'email']);

        return response()->json([
            'user' => $user,
        ]);
    }

    private function emailAuthUnavailable(InstallService $install): ?JsonResponse
    {
        if (! $install->isInstalled()) {
            return response()->json([
                'error' => [
                    'code' => 'InstallationRequired',
                    'message' => '系统尚未完成安装',
                ],
            ], 409);
        }

        if (! $install->emailAuthConfig()['enabled']) {
            return response()->json([
                'error' => [
                    'code' => 'EmailLoginDisabled',
                    'message' => '邮箱登录未启用',
                ],
            ], 403);
        }

        return null;
    }

    private function registrationEnabled(InstallService $install): bool
    {
        $config = $install->emailAuthConfig();

        return array_key_exists('registration_enabled', $config)
            ? (bool) $config['registration_enabled']
            : true;
    }

    private function frontendUrl(): string
    {
        try {
            $setting = SystemSetting::where('key', 'basic_info')->first();
            $value = $setting ? $setting->decodedValue() : [];
            $storedUrl = is_array($value) ? trim((string) ($value['frontend_url'] ?? '')) : '';
        } catch (Throwable $e) {
            $storedUrl = '';
        }

        return rtrim($storedUrl !== '' ? $storedUrl : config('app.frontend_url'), '/');
    }

    private function emailUserQuery(string $email)
    {
        return User::query()->whereRaw('LOWER(email) = ?', [$email]);
    }
}
