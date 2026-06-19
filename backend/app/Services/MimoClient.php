<?php

namespace App\Services;

use Illuminate\Http\Client\Factory as HttpFactory;
use RuntimeException;

class MimoClient
{
    private $http;

    public function __construct(HttpFactory $http)
    {
        $this->http = $http;
    }

    public function chatCompletions(array $config, array $payload): array
    {
        if (empty($config['api_key'])) {
            throw new RuntimeException('Mimo API 配置未完成');
        }

        $baseUrl = rtrim($config['base_url'] ?: config('services.mimo.base_url'), '/');
        $response = $this->http
            ->timeout(config('services.mimo.timeout'))
            ->acceptJson()
            ->asJson()
            ->withHeaders([
                'api-key' => $config['api_key'],
            ])
            ->post($baseUrl.'/chat/completions', $payload);

        if (! $response->successful()) {
            $error = $response->json('error');
            $message = $response->json('error.message') ?: $response->json('message');

            if (! $message && is_string($error)) {
                $message = $error;
            }

            throw new RuntimeException($message ?: 'Mimo API 调用失败');
        }

        return $response->json();
    }

    public function buildAsrPayload(string $audioBase64, string $mimeType, ?string $prompt = null, ?string $language = null): array
    {
        $mimeType = $this->normalizeAudioMimeType($mimeType);
        $language = $this->normalizeAsrLanguage($language);

        return [
            'model' => 'mimo-v2.5-asr',
            'messages' => [[
                'role' => 'user',
                'content' => array_values(array_filter([
                    [
                        'type' => 'input_audio',
                        'input_audio' => [
                            'data' => "data:{$mimeType};base64,{$audioBase64}",
                        ],
                    ],
                    $prompt ? ['type' => 'text', 'text' => $prompt] : null,
                ])),
            ]],
            'asr_options' => [
                'language' => $language,
            ],
        ];
    }

    public function buildTtsPayload(string $text, array $options = []): array
    {
        $format = $options['response_format'] ?? $options['format'] ?? 'wav';
        $stylePrompt = $this->stylePromptWithSpeechRate(
            $options['style_prompt'] ?? '专业、清晰、稳定的播报语气。',
            $options['speech_rate'] ?? null
        );

        return [
            'model' => 'mimo-v2.5-tts',
            'messages' => [
                [
                    'role' => 'user',
                    'content' => $stylePrompt,
                ],
                [
                    'role' => 'assistant',
                    'content' => $text,
                ],
            ],
            'audio' => array_filter([
                'format' => $format,
                'voice' => $options['voice'] ?? null,
            ], fn ($value) => $value !== null && $value !== ''),
        ];
    }

    public function buildVoiceDesignPayload(string $description, string $text, array $options = []): array
    {
        $format = $options['response_format'] ?? $options['format'] ?? 'wav';
        $description = $this->stylePromptWithSpeechRate($description, $options['speech_rate'] ?? null);

        return [
            'model' => 'mimo-v2.5-tts-voicedesign',
            'messages' => [
                [
                    'role' => 'user',
                    'content' => $description,
                ],
                [
                    'role' => 'assistant',
                    'content' => $text,
                ],
            ],
            'audio' => [
                'format' => $format,
                'optimize_text_preview' => (bool) ($options['optimize_text_preview'] ?? false),
            ],
        ];
    }

    public function buildVoiceClonePayload(string $audioBase64, string $mimeType, string $text, ?string $label = null, array $options = []): array
    {
        $format = $options['response_format'] ?? $options['format'] ?? 'wav';
        $label = $this->stylePromptWithSpeechRate($label ?? '', $options['speech_rate'] ?? null);

        return [
            'model' => 'mimo-v2.5-tts-voiceclone',
            'messages' => [
                [
                    'role' => 'user',
                    'content' => $label,
                ],
                [
                    'role' => 'assistant',
                    'content' => $text,
                ],
            ],
            'audio' => [
                'format' => $format,
                'voice' => "data:{$mimeType};base64,{$audioBase64}",
            ],
        ];
    }

    public function normalizeAudioMimeType(?string $mimeType, ?string $filename = null): string
    {
        $extension = strtolower(pathinfo((string) $filename, PATHINFO_EXTENSION));
        $byExtension = [
            'mp3' => 'audio/mpeg',
            'wav' => 'audio/wav',
            'wave' => 'audio/wav',
            'm4a' => 'audio/mp4',
            'mp4' => 'video/mp4',
            'webm' => 'audio/webm',
            'ogg' => 'audio/ogg',
            'oga' => 'audio/ogg',
            'flac' => 'audio/flac',
        ];

        if ($extension !== '' && isset($byExtension[$extension])) {
            return $byExtension[$extension];
        }

        $normalized = strtolower(trim((string) $mimeType));
        $aliases = [
            'audio/x-wav' => 'audio/wav',
            'audio/wave' => 'audio/wav',
            'audio/x-pn-wav' => 'audio/wav',
            'audio/x-m4a' => 'audio/mp4',
            'audio/mp3' => 'audio/mpeg',
            'audio/x-mpeg' => 'audio/mpeg',
            'application/ogg' => 'audio/ogg',
            'application/octet-stream' => 'audio/mpeg',
        ];

        return $aliases[$normalized] ?? ($normalized ?: 'audio/mpeg');
    }

    private function normalizeAsrLanguage(?string $language): string
    {
        $language = strtolower(trim((string) $language));

        if ($language === '' || $language === 'auto') {
            return 'auto';
        }

        if (in_array($language, ['zh', 'zh-cn', 'zh_cn', 'cn'], true)) {
            return 'zh';
        }

        if (in_array($language, ['en', 'en-us', 'en_us'], true)) {
            return 'en';
        }

        return 'auto';
    }

    private function stylePromptWithSpeechRate(string $prompt, ?string $speechRate): string
    {
        $ratePrompts = [
            'x-slow' => '语速很慢，停顿充分，适合逐句听清。',
            'slow' => '语速偏慢，表达清晰，停顿自然。',
            'normal' => '语速正常，节奏稳定。',
            'fast' => '语速偏快，表达紧凑但保持清晰。',
            'x-fast' => '语速很快，节奏紧凑，减少停顿。',
        ];

        $speechRatePrompt = $ratePrompts[$speechRate] ?? null;
        if (! $speechRatePrompt || strpos($prompt, $speechRatePrompt) !== false) {
            return $prompt;
        }

        return trim($prompt)."\n".$speechRatePrompt;
    }
}
