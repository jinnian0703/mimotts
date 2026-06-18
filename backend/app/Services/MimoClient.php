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
            $message = $response->json('error.message') ?: $response->json('message') ?: 'Mimo API 调用失败';
            throw new RuntimeException($message);
        }

        return $response->json();
    }

    public function buildAsrPayload(string $audioBase64, string $mimeType, ?string $prompt = null): array
    {
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
                'language' => 'auto',
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
