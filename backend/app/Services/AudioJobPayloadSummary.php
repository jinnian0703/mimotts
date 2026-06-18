<?php

namespace App\Services;

use App\Models\AudioJob;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

class AudioJobPayloadSummary
{
    public function forJob(AudioJob $job): array
    {
        $payload = is_array($job->request_payload) ? $job->request_payload : [];
        $sections = [];
        $options = [];

        $this->appendOption($options, '模型', Arr::get($payload, 'model') ?: $job->model);

        switch ($job->type) {
            case 'asr':
                $this->appendSection($sections, '识别提示词', $this->messageText($payload, 0));
                $this->appendOption($options, '语言', Arr::get($payload, 'asr_options.language'));
                break;
            case 'tts':
                $this->appendSection($sections, '合成文本', $this->messageText($payload, 1));
                $this->appendSection($sections, '风格指令', $this->messageText($payload, 0));
                $this->appendAudioOptions($options, $payload);
                break;
            case 'voice_design':
                $this->appendSection($sections, '音色要求', $this->messageText($payload, 0));
                $this->appendSection($sections, '试听文本', $this->messageText($payload, 1));
                $this->appendAudioOptions($options, $payload);
                $this->appendOption($options, '文本优化', Arr::get($payload, 'audio.optimize_text_preview'));
                break;
            case 'voice_clone':
                $this->appendSection($sections, '音色名称/提示', $this->messageText($payload, 0));
                $this->appendSection($sections, '合成文本', $this->messageText($payload, 1));
                $this->appendAudioOptions($options, $payload);
                break;
            default:
                foreach (Arr::get($payload, 'messages', []) as $index => $message) {
                    if (! is_array($message)) {
                        continue;
                    }

                    $role = $message['role'] ?? 'message';
                    $this->appendSection($sections, "消息 {$index} ({$role})", $this->contentText($message['content'] ?? null));
                }

                $this->appendAudioOptions($options, $payload);
                break;
        }

        return [
            'sections' => $sections,
            'options' => $options,
        ];
    }

    private function appendAudioOptions(array &$options, array $payload): void
    {
        $this->appendOption($options, '输出格式', Arr::get($payload, 'audio.format'));

        $voice = Arr::get($payload, 'audio.voice');
        if (is_string($voice) && strpos($voice, 'data:') === 0) {
            $voice = null;
        }

        $this->appendOption($options, '音色', $voice);
    }

    private function appendSection(array &$sections, string $label, $value): void
    {
        $text = $this->safeText($value);

        if ($text === null) {
            return;
        }

        $sections[] = [
            'label' => $label,
            'value' => $text,
        ];
    }

    private function appendOption(array &$options, string $label, $value): void
    {
        if (is_bool($value)) {
            $options[] = [
                'label' => $label,
                'value' => $value,
            ];

            return;
        }

        if (is_int($value) || is_float($value)) {
            $options[] = [
                'label' => $label,
                'value' => $value,
            ];

            return;
        }

        $text = $this->safeText($value);

        if ($text === null) {
            return;
        }

        $options[] = [
            'label' => $label,
            'value' => $text,
        ];
    }

    private function messageText(array $payload, int $index): ?string
    {
        return $this->contentText(Arr::get($payload, "messages.{$index}.content"));
    }

    private function contentText($content): ?string
    {
        if (is_string($content)) {
            return $content;
        }

        if (! is_array($content)) {
            return null;
        }

        $parts = [];

        foreach ($content as $item) {
            if (is_string($item)) {
                $parts[] = $item;
                continue;
            }

            if (! is_array($item)) {
                continue;
            }

            if (($item['type'] ?? null) === 'text' && isset($item['text'])) {
                $parts[] = $item['text'];
                continue;
            }

            if (isset($item['text']) && is_string($item['text'])) {
                $parts[] = $item['text'];
                continue;
            }

            if (isset($item['content']) && is_string($item['content'])) {
                $parts[] = $item['content'];
            }
        }

        return implode("\n", array_filter($parts, fn ($part) => trim((string) $part) !== ''));
    }

    private function safeText($value): ?string
    {
        if (! is_scalar($value)) {
            return null;
        }

        $text = trim((string) $value);

        if ($text === '' || strpos($text, 'data:') === 0) {
            return null;
        }

        return Str::limit($text, 5000);
    }
}
