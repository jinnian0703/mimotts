<?php

namespace App\Http\Controllers;

use App\Services\AuditLogger;
use App\Services\PresetConfigService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PresetConfigController
{
    public function show(Request $request, PresetConfigService $presets): JsonResponse
    {
        return response()->json([
            'config' => $presets->effectiveConfig($request->user()),
        ]);
    }

    public function showUser(Request $request, PresetConfigService $presets): JsonResponse
    {
        return response()->json([
            'config' => array_merge(
                $presets->editableUserConfig($request->user()),
                [
                    'source' => $presets->userConfig($request->user()) ? 'user' : 'inherited',
                    'has_personal' => $presets->userConfig($request->user()) !== null,
                ]
            ),
        ]);
    }

    public function updateUser(
        Request $request,
        PresetConfigService $presets,
        AuditLogger $audit
    ): JsonResponse {
        $config = $presets->saveUser($request->user(), $this->validatedConfig($request));
        $audit->record($request, 'preset_config.update.user', 'system_setting', null, [
            'scope' => 'user',
            'target_user_id' => $request->user()->id,
        ]);

        return response()->json([
            'config' => $config,
        ]);
    }

    public function resetUser(
        Request $request,
        PresetConfigService $presets,
        AuditLogger $audit
    ): JsonResponse {
        $presets->resetUser($request->user());
        $audit->record($request, 'preset_config.reset.user', 'system_setting', null, [
            'scope' => 'user',
            'target_user_id' => $request->user()->id,
        ]);

        return response()->json([
            'config' => array_merge(
                $presets->editableUserConfig($request->user()),
                [
                    'source' => 'inherited',
                    'has_personal' => false,
                ]
            ),
        ]);
    }

    public function showAdmin(PresetConfigService $presets): JsonResponse
    {
        return response()->json([
            'config' => array_merge($presets->globalConfig(), [
                'source' => 'global',
                'has_personal' => false,
            ]),
        ]);
    }

    public function updateAdmin(
        Request $request,
        PresetConfigService $presets,
        AuditLogger $audit
    ): JsonResponse {
        $config = $presets->saveGlobal($this->validatedConfig($request));
        $audit->record($request, 'preset_config.update.admin', 'system_setting', null, [
            'scope' => 'global',
            'key' => PresetConfigService::GLOBAL_KEY,
        ]);

        return response()->json([
            'config' => $config,
        ]);
    }

    public function defaults(PresetConfigService $presets): JsonResponse
    {
        return response()->json([
            'config' => array_merge($presets->defaults(), [
                'source' => 'default',
                'has_personal' => false,
            ]),
        ]);
    }

    private function validatedConfig(Request $request): array
    {
        return $request->validate([
            'text_tags' => ['required', 'array', 'max:80'],
            'text_tags.*.label' => ['required', 'string', 'max:80'],
            'text_tags.*.value' => ['required', 'string', 'max:200'],
            'text_tags.*.category' => ['nullable', 'string', 'max:50'],

            'style_presets' => ['required', 'array', 'max:80'],
            'style_presets.*.value' => ['nullable', 'string', 'max:80'],
            'style_presets.*.label' => ['required', 'string', 'max:80'],
            'style_presets.*.prompt' => ['required', 'string', 'max:2000'],
            'style_presets.*.delivery_mode' => ['nullable', Rule::in(['speech', 'singing'])],

            'voice_design_presets' => ['required', 'array', 'max:40'],
            'voice_design_presets.*.value' => ['nullable', 'string', 'max:80'],
            'voice_design_presets.*.label' => ['required', 'string', 'max:80'],
            'voice_design_presets.*.description' => ['required', 'string', 'max:2000'],
            'voice_design_presets.*.text' => ['required', 'string', 'max:1000'],
            'voice_design_presets.*.speech_rate' => ['nullable', Rule::in(['off', 'x-slow', 'slow', 'normal', 'fast', 'x-fast'])],
            'voice_design_presets.*.optimize_text_preview' => ['nullable', 'boolean'],
        ], [
            'text_tags.required' => '请配置语音合成标签',
            'text_tags.*.label.required' => '标签名称不能为空',
            'text_tags.*.value.required' => '标签内容不能为空',
            'style_presets.required' => '请配置自然语言预设',
            'style_presets.*.label.required' => '预设名称不能为空',
            'style_presets.*.prompt.required' => '预设指令不能为空',
            'voice_design_presets.required' => '请配置音色设计预设',
            'voice_design_presets.*.label.required' => '音色设计预设名称不能为空',
            'voice_design_presets.*.description.required' => '音色要求不能为空',
            'voice_design_presets.*.text.required' => '试听文本不能为空',
        ]);
    }
}
