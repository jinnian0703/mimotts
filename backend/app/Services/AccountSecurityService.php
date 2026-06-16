<?php

namespace App\Services;

use App\Models\User;
use RuntimeException;

class AccountSecurityService
{
    public function issueTwoFactorCode(User $user, array $emailConfig): string
    {
        if (! $user->email) {
            throw new RuntimeException('账号未绑定邮箱');
        }

        $code = (string) random_int(100000, 999999);
        $user->forceFill([
            'two_factor_code_hash' => hash('sha256', $code),
            'two_factor_expires_at' => now()->addMinutes(10),
        ])->save();

        $templateService = app(EmailTemplateService::class);
        $template = $templateService->template($emailConfig, EmailTemplateService::TWO_FACTOR);
        $variables = [
            'app_name' => config('app.name', 'Mimo'),
            'user_name' => $user->name,
            'email' => $user->email,
            'code' => $code,
            'expires_minutes' => 10,
        ];
        $subject = $templateService->render($template['subject'], $variables);
        $body = $templateService->render($template['body'], $variables);

        app(MailConfigService::class)->send($emailConfig, (string) $user->email, $subject, $body, $user->name);

        return $code;
    }

    public function verifyTwoFactorCode(User $user, string $code): bool
    {
        if (! $user->two_factor_code_hash || ! $user->two_factor_expires_at) {
            return false;
        }

        if ($user->two_factor_expires_at->lt(now())) {
            $this->clearTwoFactorCode($user);

            return false;
        }

        $valid = hash_equals($user->two_factor_code_hash, hash('sha256', $code));

        if ($valid) {
            $this->clearTwoFactorCode($user);
        }

        return $valid;
    }

    public function clearTwoFactorCode(User $user): void
    {
        $user->forceFill([
            'two_factor_code_hash' => null,
            'two_factor_expires_at' => null,
        ])->save();
    }

}
