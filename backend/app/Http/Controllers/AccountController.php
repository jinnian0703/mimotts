<?php

namespace App\Http\Controllers;

use App\Models\AudioFile;
use App\Models\User;
use App\Services\AccountSecurityService;
use App\Services\AuditLogger;
use App\Services\EmailVerificationService;
use App\Services\InstallService;
use App\Services\LinuxDoOAuthService;
use App\Support\DisplayTime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Throwable;

class AccountController
{
    public function linuxDoRedirect(Request $request, LinuxDoOAuthService $oauth): JsonResponse
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
        $redirectUri = $oauth->redirectUriForRequest($request);
        $frontendUrl = $oauth->frontendUrlForRequest($request);
        $request->session()->put('linuxdo_oauth_state', $state);
        $request->session()->put('linuxdo_oauth_mode', 'bind');
        $request->session()->put('linuxdo_oauth_user_id', $request->user()->id);
        $request->session()->put('linuxdo_oauth_redirect_uri', $redirectUri);
        $request->session()->put('linuxdo_oauth_frontend_url', $frontendUrl);

        return response()->json([
            'authorize_url' => $oauth->authorizationUrl($state, $redirectUri),
        ]);
    }

    public function unlinkLinuxDo(Request $request, AuditLogger $audit): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'current_password' => ['nullable', 'string', 'max:128'],
        ]);

        if (! $user->has_password) {
            return response()->json([
                'error' => [
                    'code' => 'PasswordRequiredBeforeUnlink',
                    'message' => '请先设置密码后再解绑 LinuxDo',
                ],
            ], 422);
        }

        $this->requireCurrentPassword($user, $data['current_password'] ?? null);

        if (! $user->linuxdo_id) {
            return response()->json([
                'user' => $user->fresh(),
            ]);
        }

        $user->forceFill(['linuxdo_id' => null])->save();
        $audit->record($request, 'account.linuxdo.unlink');

        return response()->json([
            'user' => $user->fresh(),
        ]);
    }

    public function updateProfile(Request $request, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $request->user()->forceFill([
            'name' => $data['name'],
        ])->save();

        $audit->record($request, 'account.profile.update');

        return response()->json([
            'user' => $request->user()->fresh(),
        ]);
    }

    public function updateEmail(Request $request, InstallService $install, EmailVerificationService $verification, AuditLogger $audit): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'email' => [
                'required',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($user->id),
            ],
            'current_password' => ['nullable', 'string', 'max:128'],
        ], [
            'email.unique' => '该邮箱已被注册，无法绑定到当前账号',
        ]);

        $this->requireCurrentPassword($user, $data['current_password'] ?? null);

        $email = Str::lower($data['email']);
        if ($email === Str::lower((string) $user->email)) {
            return response()->json(['user' => $user->fresh()]);
        }

        $oldEmail = $user->email;
        $oldVerifiedAt = $user->email_verified_at;
        $emailConfig = $install->emailAuthConfigForUpdate();
        $verificationRequired = (bool) ($emailConfig['verification_required'] ?? false);

        $user->forceFill([
            'email' => $email,
            'email_verified_at' => $verificationRequired ? null : now(),
        ])->save();

        if ($verificationRequired) {
            try {
                $verification->issue($user, $emailConfig);
            } catch (Throwable $e) {
                $user->forceFill([
                    'email' => $oldEmail,
                    'email_verified_at' => $oldVerifiedAt,
                    'email_verification_token' => null,
                    'email_verification_expires_at' => null,
                ])->save();

                return response()->json([
                    'error' => [
                        'code' => 'VerificationMailFailed',
                        'message' => '验证邮件发送失败',
                    ],
                ], 422);
            }
        }

        $audit->record($request, 'account.email.update');

        return response()->json([
            'user' => $user->fresh(),
            'verification_required' => $verificationRequired,
        ]);
    }

    public function updatePassword(Request $request, AuditLogger $audit): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'current_password' => ['nullable', 'string', 'max:128'],
            'password' => ['required', 'string', 'max:128', 'confirmed', Password::min(8)],
        ]);

        $this->requireCurrentPassword($user, $data['current_password'] ?? null);

        $user->forceFill([
            'password' => $data['password'],
        ])->save();

        $audit->record($request, 'account.password.update');

        return response()->json([
            'user' => $user->fresh(),
        ]);
    }

    public function twoFactorChallenge(Request $request, InstallService $install, AccountSecurityService $security, AuditLogger $audit): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'current_password' => ['nullable', 'string', 'max:128'],
        ]);

        $this->requireCurrentPassword($user, $data['current_password'] ?? null);

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

        $audit->record($request, 'account.two_factor.challenge');
        $freshUser = $user->fresh();

        return response()->json([
            'sent' => true,
            'expires_at' => DisplayTime::format($freshUser->two_factor_expires_at),
        ]);
    }

    public function updateTwoFactor(Request $request, AccountSecurityService $security, AuditLogger $audit): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'enabled' => ['required', 'boolean'],
            'code' => ['nullable', 'string', 'size:6'],
            'current_password' => ['nullable', 'string', 'max:128'],
        ]);

        $this->requireCurrentPassword($user, $data['current_password'] ?? null);

        if ((bool) $data['enabled']) {
            if (! $security->verifyTwoFactorCode($user, (string) ($data['code'] ?? ''))) {
                return response()->json([
                    'error' => [
                        'code' => 'InvalidTwoFactorCode',
                        'message' => '验证码无效或已过期',
                    ],
                ], 422);
            }

            $user->forceFill(['two_factor_enabled' => true])->save();
            $audit->record($request, 'account.two_factor.enable');
        } else {
            $user->forceFill([
                'two_factor_enabled' => false,
                'two_factor_code_hash' => null,
                'two_factor_expires_at' => null,
            ])->save();
            $audit->record($request, 'account.two_factor.disable');
        }

        return response()->json([
            'user' => $user->fresh(),
        ]);
    }

    public function destroy(Request $request, AuditLogger $audit): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'current_password' => ['nullable', 'string', 'max:128'],
            'confirmation' => ['required', 'string', 'max:255'],
        ]);

        $this->requireCurrentPassword($user, $data['current_password'] ?? null);

        $expectedConfirmation = (string) ($user->email ?: $user->name);
        if ($data['confirmation'] !== $expectedConfirmation) {
            throw ValidationException::withMessages([
                'confirmation' => ['确认内容不匹配'],
            ]);
        }

        if ($user->is_admin && User::query()->where('is_admin', true)->count() <= 1) {
            return response()->json([
                'error' => [
                    'code' => 'LastAdminAccount',
                    'message' => '最后一个管理员账号不能注销',
                ],
            ], 422);
        }

        $audit->record($request, 'account.delete');

        DB::transaction(function () use ($user): void {
            AudioFile::query()
                ->where('user_id', $user->id)
                ->get()
                ->each(function (AudioFile $file): void {
                    Storage::disk($file->disk)->delete($file->path);
                });

            $user->delete();
        });

        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

    private function requireCurrentPassword(User $user, ?string $currentPassword): void
    {
        if (! $user->has_password) {
            return;
        }

        if (! $currentPassword || ! Hash::check($currentPassword, (string) $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['当前密码不正确'],
            ]);
        }
    }
}
