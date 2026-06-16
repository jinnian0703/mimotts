<?php

namespace App\Http\Controllers;

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

        return response()->json([
            'authorize_url' => $oauth->authorizationUrl($state),
        ]);
    }

    public function callback(Request $request, LinuxDoOAuthService $oauth, AuditLogger $audit)
    {
        $request->validate([
            'code' => ['required', 'string'],
            'state' => ['required', 'string'],
        ]);

        if (! hash_equals((string) $request->session()->pull('linuxdo_oauth_state'), (string) $request->query('state'))) {
            throw new RuntimeException('登录状态校验失败');
        }

        $profile = $oauth->fetchUser($request->query('code'));
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

        $frontendUrl = rtrim(config('app.frontend_url'), '/');
        if ($request->expectsJson()) {
            return response()->json(['user' => $user]);
        }

        return redirect()->away($frontendUrl.'/');
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
        if ($response = $this->emailAuthUnavailable($install)) {
            return $response;
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

        if ($user->status === 'suspended') {
            return response()->json([
                'error' => [
                    'code' => 'AccountSuspended',
                    'message' => '账号已暂停',
                ],
            ], 403);
        }

        if ($install->emailAuthConfig()['verification_required'] && ! $user->email_verified_at) {
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

    private function emailUserQuery(string $email)
    {
        return User::query()->whereRaw('LOWER(email) = ?', [$email]);
    }
}
