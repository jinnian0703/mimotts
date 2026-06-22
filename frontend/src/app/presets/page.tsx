"use client"

import { useCallback, useEffect, useState } from "react"
import {
  IconDeviceFloppy,
  IconLoader2,
  IconPlus,
  IconRefresh,
  IconRestore,
  IconTrash,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/components/auth-gate"
import { FieldHelpLabel } from "@/components/field-help-label"
import { PageHeading } from "@/components/page-heading"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { api } from "@/lib/api"
import {
  defaultPresetConfig,
  normalizePresetConfig,
  voiceDesignOptimizeTextPreview,
  voiceDesignSpeechRate,
} from "@/lib/presets"
import type {
  PresetConfig,
  StylePreset,
  TextTagPreset,
  VoiceDesignPreset,
} from "@/lib/types"

type EditableScope = "global" | "user"

const sourceLabels: Record<string, string> = {
  default: "内置默认",
  global: "全局生效",
  user: "个人生效",
  inherited: "继承全局",
}

const speechRateOptions = [
  { value: "off", label: "关闭" },
  { value: "x-slow", label: "很慢" },
  { value: "slow", label: "偏慢" },
  { value: "normal", label: "正常" },
  { value: "fast", label: "偏快" },
  { value: "x-fast", label: "很快" },
]

function cloneConfig(config: PresetConfig): PresetConfig {
  return {
    ...config,
    text_tags: config.text_tags.map((item) => ({ ...item })),
    style_presets: config.style_presets.map((item) => ({ ...item })),
    voice_design_presets: config.voice_design_presets.map((item) => ({
      ...item,
    })),
  }
}

function editablePayload(config: PresetConfig): PresetConfig {
  return {
    text_tags: config.text_tags,
    style_presets: config.style_presets,
    voice_design_presets: config.voice_design_presets,
  }
}

function nextId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`
}

export default function PresetsPage() {
  const user = useCurrentUser()
  const isAdmin = user?.role === "admin"
  const [scope, setScope] = useState<EditableScope>("global")
  const [config, setConfig] = useState<PresetConfig>(() =>
    cloneConfig(defaultPresetConfig)
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadingDefaults, setLoadingDefaults] = useState(false)
  const activeScope: EditableScope = isAdmin ? scope : "user"

  const loadConfig = useCallback(async (nextScope = activeScope) => {
    setLoading(true)

    try {
      const loaded =
        nextScope === "global" && isAdmin
          ? await api.adminPresetConfig()
          : await api.userPresetConfig()

      setConfig(cloneConfig(loaded))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "预设配置获取失败")
    } finally {
      setLoading(false)
    }
  }, [activeScope, isAdmin])

  useEffect(() => {
    let active = true
    const request =
      activeScope === "global" && isAdmin
        ? api.adminPresetConfig()
        : api.userPresetConfig()

    request
      .then((loaded) => {
        if (active) {
          setConfig(cloneConfig(loaded))
        }
      })
      .catch((error) => {
        if (active) {
          toast.error(error instanceof Error ? error.message : "预设配置获取失败")
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [activeScope, isAdmin])

  async function loadDefaults() {
    setLoadingDefaults(true)

    try {
      const defaults = await api.presetDefaults().catch(() =>
        normalizePresetConfig(defaultPresetConfig)
      )
      setConfig(cloneConfig(defaults))
      toast.success("已载入内置默认，保存后生效")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "默认预设载入失败")
    } finally {
      setLoadingDefaults(false)
    }
  }

  async function resetPersonal() {
    setSaving(true)

    try {
      const nextConfig = await api.resetUserPresetConfig()
      setConfig(cloneConfig(nextConfig))
      toast.success("已移除个人预设覆盖")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "个人预设重置失败")
    } finally {
      setSaving(false)
    }
  }

  function validateConfig() {
    const missingTag = config.text_tags.some(
      (item) => !item.label.trim() || !item.value.trim()
    )
    if (missingTag) {
      return "标签名称和标签内容不能为空"
    }

    const missingStyle = config.style_presets.some(
      (item) => !item.label.trim() || !item.prompt.trim()
    )
    if (missingStyle) {
      return "自然语言预设名称和指令不能为空"
    }

    const missingDesign = config.voice_design_presets.some(
      (item) =>
        !item.label.trim() || !item.description.trim() || !item.text.trim()
    )
    if (missingDesign) {
      return "音色设计预设名称、音色要求和试听文本不能为空"
    }

    return null
  }

  async function saveConfig() {
    const error = validateConfig()
    if (error) {
      toast.error(error)
      return
    }

    setSaving(true)

    try {
      const saved =
        activeScope === "global" && isAdmin
          ? await api.saveAdminPresetConfig(editablePayload(config))
          : await api.saveUserPresetConfig(editablePayload(config))

      setConfig(cloneConfig(saved))
      toast.success("预设配置已保存")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "预设配置保存失败")
    } finally {
      setSaving(false)
    }
  }

  function updateTextTag(index: number, patch: Partial<TextTagPreset>) {
    setConfig((current) => ({
      ...current,
      text_tags: current.text_tags.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    }))
  }

  function addTextTag() {
    setConfig((current) => ({
      ...current,
      text_tags: [
        ...current.text_tags,
        { label: "新标签", value: "（新标签）", category: "自定义" },
      ],
    }))
  }

  function removeTextTag(index: number) {
    setConfig((current) => ({
      ...current,
      text_tags: current.text_tags.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  function updateStylePreset(index: number, patch: Partial<StylePreset>) {
    setConfig((current) => ({
      ...current,
      style_presets: current.style_presets.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    }))
  }

  function addStylePreset() {
    setConfig((current) => ({
      ...current,
      style_presets: [
        ...current.style_presets,
        {
          value: nextId("style"),
          label: "新预设",
          prompt: "描述语气、情绪、节奏和停顿方式。",
          delivery_mode: "speech",
        },
      ],
    }))
  }

  function removeStylePreset(index: number) {
    setConfig((current) => ({
      ...current,
      style_presets: current.style_presets.filter(
        (_, itemIndex) => itemIndex !== index
      ),
    }))
  }

  function updateVoiceDesignPreset(
    index: number,
    patch: Partial<VoiceDesignPreset>
  ) {
    setConfig((current) => ({
      ...current,
      voice_design_presets: current.voice_design_presets.map(
        (item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)
      ),
    }))
  }

  function addVoiceDesignPreset() {
    setConfig((current) => ({
      ...current,
      voice_design_presets: [
        ...current.voice_design_presets,
        {
          value: nextId("voice-design"),
          label: "新音色",
          description: "描述音色方向、语气、年龄感、情绪和适用场景。",
          text: "这是一段用于试听音色效果的示例文本。",
          speech_rate: "normal",
          optimize_text_preview: true,
        },
      ],
    }))
  }

  function removeVoiceDesignPreset(index: number) {
    setConfig((current) => ({
      ...current,
      voice_design_presets: current.voice_design_presets.filter(
        (_, itemIndex) => itemIndex !== index
      ),
    }))
  }

  const source = sourceLabels[config.source ?? "default"] ?? "未保存"

  return (
    <>
      <PageHeading
        title="预设设置"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void loadDefaults()}
              disabled={loadingDefaults || saving}
            >
              {loadingDefaults ? (
                <IconLoader2 data-icon="inline-start" />
              ) : (
                <IconRestore data-icon="inline-start" />
              )}
              恢复默认
            </Button>
            <Button
              variant="outline"
              onClick={() => void loadConfig()}
              disabled={loading || saving}
            >
              {loading ? (
                <IconLoader2 data-icon="inline-start" />
              ) : (
                <IconRefresh data-icon="inline-start" />
              )}
              刷新
            </Button>
            <Button onClick={() => void saveConfig()} disabled={saving || loading}>
              {saving ? (
                <IconLoader2 data-icon="inline-start" />
              ) : (
                <IconDeviceFloppy data-icon="inline-start" />
              )}
              保存
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>编辑范围</CardTitle>
                <Badge variant="outline">{source}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="preset-scope">配置范围</FieldLabel>
                  {isAdmin ? (
                    <Select
                      value={scope}
                      onValueChange={(value) => {
                        setLoading(true)
                        setScope(value as EditableScope)
                      }}
                    >
                      <SelectTrigger id="preset-scope" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">全局预设</SelectItem>
                        <SelectItem value="user">个人预设</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input id="preset-scope" value="个人预设" readOnly />
                  )}
                </Field>
                <Field>
                  <FieldLabel>当前数量</FieldLabel>
                  <div className="grid grid-cols-3 gap-2">
                    <CountPill label="标签" value={config.text_tags.length} />
                    <CountPill
                      label="自然语言"
                      value={config.style_presets.length}
                    />
                    <CountPill
                      label="音色设计"
                      value={config.voice_design_presets.length}
                    />
                  </div>
                </Field>
              </FieldGroup>

              {activeScope === "user" && config.has_personal && (
                <div className="mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void resetPersonal()}
                    disabled={saving}
                  >
                    <IconRestore data-icon="inline-start" />
                    移除个人覆盖
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>语音合成标签</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={addTextTag}>
                  <IconPlus data-icon="inline-start" />
                  添加标签
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {config.text_tags.map((tag, index) => (
                <div
                  key={`${tag.label}-${index}`}
                  className="grid gap-3 rounded-xl border border-border/70 p-3 lg:grid-cols-[1fr_1fr_1fr_auto]"
                >
                  <Field>
                    <FieldLabel>名称</FieldLabel>
                    <Input
                      value={tag.label}
                      onChange={(event) =>
                        updateTextTag(index, { label: event.target.value })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel>内容</FieldLabel>
                    <Input
                      value={tag.value}
                      onChange={(event) =>
                        updateTextTag(index, { value: event.target.value })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel>分类</FieldLabel>
                    <Input
                      value={tag.category ?? ""}
                      onChange={(event) =>
                        updateTextTag(index, { category: event.target.value })
                      }
                      placeholder="常用 / 情绪 / 方言"
                    />
                  </Field>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTextTag(index)}
                      aria-label="删除标签"
                    >
                      <IconTrash />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>自然语言预设</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={addStylePreset}>
                  <IconPlus data-icon="inline-start" />
                  添加预设
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {config.style_presets.map((preset, index) => (
                <div
                  key={`${preset.value}-${index}`}
                  className="grid gap-3 rounded-xl border border-border/70 p-3 lg:grid-cols-[1fr_1fr_160px_auto]"
                >
                  <Field>
                    <FieldHelpLabel
                      help="内部标识用于下拉框选项，留空保存时会自动生成。"
                    >
                      标识
                    </FieldHelpLabel>
                    <Input
                      value={preset.value}
                      onChange={(event) =>
                        updateStylePreset(index, { value: event.target.value })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel>名称</FieldLabel>
                    <Input
                      value={preset.label}
                      onChange={(event) =>
                        updateStylePreset(index, { label: event.target.value })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel>模式</FieldLabel>
                    <Select
                      value={preset.delivery_mode ?? preset.deliveryMode ?? "speech"}
                      onValueChange={(value) =>
                        updateStylePreset(index, {
                          delivery_mode: value as "speech" | "singing",
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="speech">朗读</SelectItem>
                        <SelectItem value="singing">唱歌</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeStylePreset(index)}
                      aria-label="删除预设"
                    >
                      <IconTrash />
                    </Button>
                  </div>
                  <Field className="lg:col-span-4">
                    <FieldLabel>风格指令</FieldLabel>
                    <Textarea
                      rows={3}
                      value={preset.prompt}
                      onChange={(event) =>
                        updateStylePreset(index, { prompt: event.target.value })
                      }
                    />
                  </Field>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>音色设计预设</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addVoiceDesignPreset}
                >
                  <IconPlus data-icon="inline-start" />
                  添加预设
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {config.voice_design_presets.map((preset, index) => (
                <div
                  key={`${preset.value}-${index}`}
                  className="grid gap-3 rounded-xl border border-border/70 p-3 lg:grid-cols-[1fr_1fr_160px_150px_auto]"
                >
                  <Field>
                    <FieldHelpLabel
                      help="内部标识用于下拉框选项，留空保存时会自动生成。"
                    >
                      标识
                    </FieldHelpLabel>
                    <Input
                      value={preset.value}
                      onChange={(event) =>
                        updateVoiceDesignPreset(index, {
                          value: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel>名称</FieldLabel>
                    <Input
                      value={preset.label}
                      onChange={(event) =>
                        updateVoiceDesignPreset(index, {
                          label: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel>语速</FieldLabel>
                    <Select
                      value={voiceDesignSpeechRate(preset)}
                      onValueChange={(value) =>
                        updateVoiceDesignPreset(index, { speech_rate: value })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {speechRateOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldContent>
                      <FieldTitle>文本优化</FieldTitle>
                    </FieldContent>
                    <div className="flex h-9 items-center rounded-md border px-3">
                      <Switch
                        checked={voiceDesignOptimizeTextPreview(preset)}
                        onCheckedChange={(checked) =>
                          updateVoiceDesignPreset(index, {
                            optimize_text_preview: checked,
                          })
                        }
                        size="sm"
                      />
                    </div>
                  </Field>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeVoiceDesignPreset(index)}
                      aria-label="删除音色设计预设"
                    >
                      <IconTrash />
                    </Button>
                  </div>
                  <Field className="lg:col-span-5">
                    <FieldLabel>音色要求</FieldLabel>
                    <Textarea
                      rows={3}
                      value={preset.description}
                      onChange={(event) =>
                        updateVoiceDesignPreset(index, {
                          description: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field className="lg:col-span-5">
                    <FieldLabel>试听文本</FieldLabel>
                    <Textarea
                      rows={2}
                      value={preset.text}
                      onChange={(event) =>
                        updateVoiceDesignPreset(index, {
                          text: event.target.value,
                        })
                      }
                    />
                  </Field>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>生效规则</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <RuleLine title="个人优先" text="保存个人预设后，工作台优先使用个人配置。" />
            <RuleLine title="全局兜底" text="未设置个人预设时，使用管理员保存的全局预设。" />
            <RuleLine title="内置默认" text="全局预设未保存时，系统使用内置默认预设。" />
            <RuleLine title="唱歌模式" text="合成模式选择唱歌时，只显示唱歌预设。" />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2 text-center">
      <div className="text-lg font-semibold leading-none">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function RuleLine({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-border/70 p-3">
      <div className="font-medium text-foreground">{title}</div>
      <div className="mt-1">{text}</div>
    </div>
  )
}
