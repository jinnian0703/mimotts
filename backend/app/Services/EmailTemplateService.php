<?php

namespace App\Services;

class EmailTemplateService
{
    public const VERIFICATION = 'verification';
    public const TWO_FACTOR = 'two_factor';

    private const DEFAULT_TEMPLATES = [
        self::VERIFICATION => [
            'subject' => '邮箱验证',
            'body' => "请打开以下链接完成邮箱验证：\n\n{verification_url}\n\n链接 {expires_hours} 小时内有效。",
        ],
        self::TWO_FACTOR => [
            'subject' => '两步验证',
            'body' => "验证码：{code}\n\n验证码 {expires_minutes} 分钟内有效。如非本人操作，请立即修改密码。",
        ],
    ];

    public function defaults(): array
    {
        return $this->normalizeTemplates([]);
    }

    public function normalizeTemplates(array $templates): array
    {
        return [
            self::VERIFICATION => $this->normalizeTemplate($templates[self::VERIFICATION] ?? [], self::VERIFICATION),
            self::TWO_FACTOR => $this->normalizeTemplate($templates[self::TWO_FACTOR] ?? [], self::TWO_FACTOR),
        ];
    }

    public function template(array $emailConfig, string $name): array
    {
        $templates = $this->normalizeTemplates($emailConfig['templates'] ?? []);

        return $templates[$name] ?? self::DEFAULT_TEMPLATES[$name];
    }

    public function render(string $template, array $variables): string
    {
        $replacements = [];
        foreach ($variables as $key => $value) {
            $replacements['{'.$key.'}'] = (string) $value;
        }

        return strtr($template, $replacements);
    }

    private function normalizeTemplate(array $template, string $name): array
    {
        $default = self::DEFAULT_TEMPLATES[$name];
        $subject = trim((string) ($template['subject'] ?? ''));
        $body = (string) ($template['body'] ?? '');

        return [
            'subject' => $subject !== '' ? $subject : $default['subject'],
            'body' => trim($body) !== '' ? $body : $default['body'],
        ];
    }
}
