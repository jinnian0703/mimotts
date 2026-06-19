<?php

namespace Tests\Unit;

use App\Services\MimoClient;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MimoClientTest extends TestCase
{
    public function test_builds_tts_payload_with_required_model(): void
    {
        $client = new MimoClient(new HttpFactory());

        $payload = $client->buildTtsPayload('欢迎使用 MimoTTS', [
            'voice' => 'demo-voice',
            'response_format' => 'wav',
        ]);

        $this->assertSame('mimo-v2.5-tts', $payload['model']);
        $this->assertSame('欢迎使用 MimoTTS', $payload['messages'][1]['content']);
        $this->assertSame('demo-voice', $payload['audio']['voice']);
        $this->assertSame('wav', $payload['audio']['format']);
    }

    public function test_builds_singing_tts_payload_with_style_prefix(): void
    {
        $client = new MimoClient(new HttpFactory());

        $payload = $client->buildTtsPayload('月光落在窗前', [
            'delivery_mode' => 'singing',
        ]);
        $alreadyTaggedPayload = $client->buildTtsPayload('(singing)月光落在窗前', [
            'delivery_mode' => 'singing',
        ]);

        $this->assertSame('(唱歌)月光落在窗前', $payload['messages'][1]['content']);
        $this->assertSame('(singing)月光落在窗前', $alreadyTaggedPayload['messages'][1]['content']);
    }

    public function test_builds_asr_payload_with_input_audio(): void
    {
        $client = new MimoClient(new HttpFactory());

        $payload = $client->buildAsrPayload('YWJj', 'audio/wav', '请转写');

        $this->assertSame('mimo-v2.5-asr', $payload['model']);
        $this->assertSame('input_audio', $payload['messages'][0]['content'][0]['type']);
        $this->assertSame('data:audio/wav;base64,YWJj', $payload['messages'][0]['content'][0]['input_audio']['data']);
        $this->assertSame('请转写', $payload['messages'][0]['content'][1]['text']);
    }

    public function test_builds_voice_design_and_clone_payloads(): void
    {
        $client = new MimoClient(new HttpFactory());

        $design = $client->buildVoiceDesignPayload('沉稳、清晰的播报声', '欢迎使用');
        $optimizedDesign = $client->buildVoiceDesignPayload('沉稳、清晰的播报声', '欢迎使用', [
            'optimize_text_preview' => true,
        ]);
        $clone = $client->buildVoiceClonePayload('YWJj', 'audio/mpeg', '样本 A', '客服女声');

        $this->assertSame('mimo-v2.5-tts-voicedesign', $design['model']);
        $this->assertSame('欢迎使用', $design['messages'][1]['content']);
        $this->assertFalse($design['audio']['optimize_text_preview']);
        $this->assertTrue($optimizedDesign['audio']['optimize_text_preview']);
        $this->assertSame('mimo-v2.5-tts-voiceclone', $clone['model']);
        $this->assertSame('客服女声', $clone['messages'][0]['content']);
        $this->assertSame('data:audio/mpeg;base64,YWJj', $clone['audio']['voice']);
    }

    public function test_normalizes_audio_mime_types_for_uploads(): void
    {
        $client = new MimoClient(new HttpFactory());

        $this->assertSame('audio/wav', $client->normalizeAudioMimeType('audio/x-wav'));
        $this->assertSame('audio/wav', $client->normalizeAudioMimeType('application/octet-stream', 'sample.wav'));
        $this->assertSame('audio/mpeg', $client->normalizeAudioMimeType('audio/mp3'));
    }

    public function test_chat_completion_uses_mimo_endpoint_and_api_key_header(): void
    {
        $http = new HttpFactory();
        $http->fake([
            'https://api.xiaomimimo.com/v1/chat/completions' => Http::response(['ok' => true]),
        ]);

        $client = new MimoClient($http);
        $result = $client->chatCompletions([
            'base_url' => 'https://api.xiaomimimo.com/v1',
            'api_key' => 'secret-key',
        ], [
            'model' => 'mimo-v2.5-tts',
            'messages' => [],
        ]);

        $this->assertSame(['ok' => true], $result);
        $http->assertSent(function (Request $request): bool {
            return $request->url() === 'https://api.xiaomimimo.com/v1/chat/completions'
                && $request->hasHeader('api-key', 'secret-key')
                && $request['model'] === 'mimo-v2.5-tts';
        });
    }
}
