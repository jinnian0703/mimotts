<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Config;
use RuntimeException;

class MailConfigService
{
    public function assertConfigured(array $emailConfig): void
    {
        $driver = $this->driver($emailConfig);
        $sender = $emailConfig['sender'] ?? [];

        if ($driver === 'api') {
            $api = $emailConfig['api'] ?? [];

            if (empty($api['endpoint']) || empty($api['token']) || empty($sender['address'])) {
                throw new RuntimeException('邮件 API 未配置，请检查 API 地址、Token 和发件邮箱');
            }

            return;
        }

        $smtp = $emailConfig['smtp'] ?? [];

        if (empty($smtp['host']) || empty($smtp['port']) || empty($sender['address'])) {
            throw new RuntimeException('邮箱服务未配置');
        }
    }

    public function send(array $emailConfig, string $to, string $subject, string $body, ?string $name = null): void
    {
        $this->assertConfigured($emailConfig);

        if ($this->driver($emailConfig) === 'api') {
            $this->sendViaApi($emailConfig, $to, $subject, $body, $name);

            return;
        }

        $this->apply($emailConfig);
        Mail::raw($body, function ($message) use ($to, $subject, $name): void {
            $message->to($to, $name)->subject($subject);
        });
    }

    public function apply(array $emailConfig): void
    {
        $smtp = $emailConfig['smtp'] ?? [];
        $sender = $emailConfig['sender'] ?? [];
        $encryption = $smtp['encryption'] ?? env('MAIL_ENCRYPTION', 'tls');

        Config::set('mail.default', 'smtp');
        Config::set('mail.mailers.smtp.host', $smtp['host'] ?? env('MAIL_HOST'));
        Config::set('mail.mailers.smtp.port', $smtp['port'] ?? env('MAIL_PORT', 587));
        Config::set('mail.mailers.smtp.username', $smtp['username'] ?? env('MAIL_USERNAME'));
        Config::set('mail.mailers.smtp.password', $smtp['password'] ?? env('MAIL_PASSWORD'));
        Config::set('mail.mailers.smtp.encryption', $this->normalizeEncryption($encryption));
        Config::set('mail.from.address', $sender['address'] ?? env('MAIL_FROM_ADDRESS', 'noreply@example.com'));
        Config::set('mail.from.name', $sender['name'] ?? env('MAIL_FROM_NAME', 'Mimo'));
    }

    private function sendViaApi(array $emailConfig, string $to, string $subject, string $body, ?string $name = null): void
    {
        $api = $emailConfig['api'] ?? [];
        $sender = $emailConfig['sender'] ?? [];
        $provider = $api['provider'] ?? 'generic_json';
        $endpoint = $api['endpoint'] ?? null;
        $token = $api['token'] ?? null;
        $fromAddress = trim((string) ($sender['address'] ?? ''));
        $fromName = trim((string) ($sender['name'] ?? ''));
        $payload = $provider === 'resend'
            ? [
                'from' => $this->resendFrom($fromAddress, $fromName),
                'to' => [$to],
                'subject' => $subject,
                'text' => $body,
            ]
            : [
                'from' => $fromAddress,
                'from_name' => $fromName,
                'to' => $to,
                'to_name' => $name,
                'subject' => $subject,
                'text' => $body,
            ];

        $response = Http::timeout(20)
            ->acceptJson()
            ->asJson()
            ->withToken($token)
            ->post($endpoint, $payload);

        if (! $response->successful()) {
            $message = $response->json('message')
                ?: $response->json('error.message')
                ?: $response->body()
                ?: '邮件 API 调用失败';

            throw new RuntimeException($message);
        }
    }

    private function resendFrom(string $address, string $name): string
    {
        return $name === '' ? $address : $name.' <'.$address.'>';
    }

    private function driver(array $emailConfig): string
    {
        return ($emailConfig['driver'] ?? 'smtp') === 'api' ? 'api' : 'smtp';
    }

    private function normalizeEncryption(?string $encryption): ?string
    {
        if (! $encryption || $encryption === 'none') {
            return null;
        }

        if ($encryption === 'starttls') {
            return 'tls';
        }

        return $encryption;
    }
}
