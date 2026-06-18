<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Str;

class EmailVerificationService
{
    public function issue(User $user, array $emailConfig): string
    {
        $token = Str::random(48);
        $user->forceFill([
            'email_verification_token' => hash('sha256', $token),
            'email_verification_expires_at' => now()->addHours(24),
        ])->save();

        $url = rtrim(config('app.frontend_url'), '/').'/login?verify_token='.$token.'&email='.urlencode((string) $user->email);
        $templateService = app(EmailTemplateService::class);
        $template = $templateService->template($emailConfig, EmailTemplateService::VERIFICATION);
        $variables = [
            'app_name' => config('app.name', 'MimoTTS'),
            'user_name' => $user->name,
            'email' => $user->email,
            'verification_url' => $url,
            'expires_hours' => 24,
            'expires_minutes' => 1440,
        ];
        $subject = $templateService->render($template['subject'], $variables);
        $body = $templateService->render($template['body'], $variables);

        app(MailConfigService::class)->send($emailConfig, (string) $user->email, $subject, $body, $user->name);

        return $token;
    }

    public function verify(string $email, string $token): ?User
    {
        $user = User::query()
            ->whereRaw('LOWER(email) = ?', [Str::lower($email)])
            ->where('email_verification_token', hash('sha256', $token))
            ->where(function ($query): void {
                $query->whereNull('email_verification_expires_at')
                    ->orWhere('email_verification_expires_at', '>=', now());
            })
            ->first();

        if (! $user) {
            return null;
        }

        $user->forceFill([
            'email_verified_at' => now(),
            'email_verification_token' => null,
            'email_verification_expires_at' => null,
            'last_login_at' => now(),
        ])->save();

        return $user->fresh();
    }

}
