"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  IconClipboardList,
  IconDeviceFloppy,
  IconFileUpload,
  IconKey,
  IconLoader2,
  IconPlayerPlay,
  IconRefresh,
  IconTrash,
  IconClock,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import type {
  AudioModule,
  AudioRetentionConfig,
  AudioTask,
  MimoConfig,
  PaginationMeta,
} from "@/lib/types"
import { StatusBadge } from "@/components/status-badge"
import { TablePagination } from "@/components/table-pagination"
import { TaskDetailDialog } from "@/components/task-detail-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { FieldHelpLabel } from "@/components/field-help-label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"

type ModuleConfig = {
  value: AudioModule
  label: string
  title: string
  acceptedFiles: string
  outputLabel: string
}

const modules: ModuleConfig[] = [
  {
    value: "speech-recognition",
    label: "语音识别",
    title: "语音识别",
    acceptedFiles: "audio/*,video/*",
    outputLabel: "下载逐字稿",
  },
  {
    value: "speech-synthesis",
    label: "语音合成",
    title: "语音合成",
    acceptedFiles: ".txt,.md",
    outputLabel: "下载音频",
  },
  {
    value: "voice-design",
    label: "音色设计",
    title: "音色设计",
    acceptedFiles: "audio/*",
    outputLabel: "下载样音",
  },
  {
    value: "voice-clone",
    label: "声音克隆",
    title: "声音克隆",
    acceptedFiles: "audio/*",
    outputLabel: "下载验证音频",
  },
]

const moduleLabels = Object.fromEntries(
  modules.map((module) => [module.value, module.label])
) as Record<AudioModule, string>

const ttsVoices = [
  { value: "mimo_default", label: "默认" },
  { value: "冰糖", label: "冰糖" },
  { value: "茉莉", label: "茉莉" },
  { value: "苏打", label: "苏打" },
  { value: "白桦", label: "白桦" },
  { value: "Mia", label: "Mia" },
  { value: "Chloe", label: "Chloe" },
  { value: "Milo", label: "Milo" },
  { value: "Dean", label: "Dean" },
]

const speechRateOptions = [
  { value: "off", label: "关闭" },
  { value: "x-slow", label: "很慢" },
  { value: "slow", label: "偏慢" },
  { value: "normal", label: "正常" },
  { value: "fast", label: "偏快" },
  { value: "x-fast", label: "很快" },
]

const deliveryModeOptions = [
  { value: "speech", label: "朗读" },
  { value: "singing", label: "唱歌" },
]

const stylePresets = [
  {
    value: "standard",
    label: "标准播报",
    prompt: "专业、清晰、稳定的播报语气。语句边界明确，停顿自然。",
  },
  {
    value: "service",
    label: "客服接待",
    prompt: "亲和、克制、耐心的服务语气。重点信息读得清楚，尾音自然收束。",
  },
  {
    value: "training",
    label: "培训讲解",
    prompt: "讲解式表达，节奏稳健，关键术语略作强调，段落之间保留短暂停顿。",
  },
  {
    value: "news",
    label: "新闻播报",
    prompt: "正式、客观、清晰的新闻播报语气。语速均衡，不夸张。",
  },
  {
    value: "commercial",
    label: "活动口播",
    prompt: "积极、有活力的口播语气。重点词轻微强调，节奏紧凑但保持清晰。",
  },
  {
    value: "singing",
    label: "自然演唱",
    prompt: "以自然、有旋律感的演唱方式表达。气息连贯，咬字清楚，情绪投入，避免播报腔。",
    deliveryMode: "singing",
  },
  {
    value: "singing-pop",
    label: "流行抒情",
    prompt: "以流行抒情歌曲的方式演唱。旋律柔和，情绪真诚，尾音自然延展，副歌部分更饱满。",
    deliveryMode: "singing",
  },
  {
    value: "singing-bright",
    label: "轻快活力",
    prompt: "以轻快、有活力的演唱方式表达。节奏明朗，咬字清晰，情绪积极，适合明亮欢快的旋律。",
    deliveryMode: "singing",
  },
  {
    value: "singing-ballad",
    label: "温柔民谣",
    prompt: "以温柔民谣的方式演唱。声音贴近、气息柔和，节奏舒展，保留细腻的情绪起伏。",
    deliveryMode: "singing",
  },
  {
    value: "singing-dramatic",
    label: "情绪高亢",
    prompt: "以情绪更强的演唱方式表达。层次递进，高潮处更有力量，保持清晰咬字和稳定气息。",
    deliveryMode: "singing",
  },
  {
    value: "director",
    label: "导演模式",
    prompt:
      "角色：专业企业旁白，声线稳定，吐字清晰。\n场景：面向正式产品介绍、培训材料或系统通知。\n指导：中等语速，句尾自然收束，重点词略作强调，段落间保留短暂停顿。",
  },
]

const textTagPresets = [
  { label: "短停顿", value: "（停顿片刻）" },
  { label: "长停顿", value: "（长停顿）" },
  { label: "深吸气", value: "（深吸一口气）" },
  { label: "叹气", value: "（叹气）" },
  { label: "轻笑", value: "（轻笑）" },
  { label: "咳嗽", value: "（咳嗽）" },
  { label: "开心", value: "（开心）" },
  { label: "悲伤", value: "（悲伤）" },
  { label: "生气", value: "（生气）" },
  { label: "温柔", value: "（温柔）" },
  { label: "兴奋", value: "（兴奋）" },
  { label: "平静", value: "（平静）" },
  { label: "小声", value: "（小声）" },
  { label: "加快", value: "（语速变快）" },
  { label: "放慢", value: "（语速变慢）" },
  { label: "重读", value: "（重读）" },
  { label: "东北话", value: "（东北话）" },
  { label: "四川话", value: "（四川话）" },
  { label: "河南话", value: "（河南话）" },
  { label: "粤语", value: "（粤语）" },
  { label: "台湾腔", value: "（台湾腔）" },
]

const recognitionAudioMaxBytes = 7 * 1024 * 1024
const recognitionAudioMaxLabel = "7 MB"
const recognitionBase64MaxLabel = "10 MB"
const taskTitleMaxLength = 20
const defaultPageSize = 20
const defaultMimoConfig: MimoConfig = {
  base_url: "https://api.xiaomimimo.com/v1",
  api_key: "",
  enabled: false,
  configured: false,
}
const defaultTaskPagination: PaginationMeta = {
  page: 1,
  perPage: defaultPageSize,
  total: 0,
  pageCount: 1,
}

async function fetchWorkbenchState(page = 1, pageSize = defaultPageSize) {
  const [taskPage, retention] = await Promise.all([
    api.taskPage({ page, pageSize }),
    api.audioRetention().catch(() => null),
  ])

  return { tasks: taskPage.tasks, pagination: taskPage.pagination, retention }
}

export function AudioWorkbench() {
  const [tasks, setTasks] = useState<AudioTask[]>([])
  const [activeModule, setActiveModule] =
    useState<AudioModule>("speech-recognition")
  const [loading, setLoading] = useState(true)
  const [retention, setRetention] = useState<AudioRetentionConfig | null>(null)
  const [taskPagination, setTaskPagination] =
    useState<PaginationMeta>(defaultTaskPagination)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)

  const refreshTasks = useCallback(async (notify = true, showLoading = true) => {
    if (showLoading) {
      setLoading(true)
    }

    try {
      const workbenchState = await fetchWorkbenchState(page, pageSize)
      setTasks(workbenchState.tasks)
      setTaskPagination(workbenchState.pagination)
      if (workbenchState.retention) {
        setRetention(workbenchState.retention)
      }
      if (notify) {
        toast.success("任务列表已更新")
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "任务列表获取失败")
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
  }, [page, pageSize])

  useEffect(() => {
    let active = true

    async function loadInitialTasks() {
      try {
        const workbenchState = await fetchWorkbenchState(page, pageSize)
        if (!active) {
          return
        }

        setTasks(workbenchState.tasks)
        setTaskPagination(workbenchState.pagination)
        if (workbenchState.retention) {
          setRetention(workbenchState.retention)
        }
      } catch (error) {
        if (active) {
          toast.error(error instanceof Error ? error.message : "任务列表获取失败")
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadInitialTasks()

    return () => {
      active = false
    }
  }, [page, pageSize])

  useEffect(() => {
    const hasActiveTasks = tasks.some((task) =>
      task.status === "queued" || task.status === "running"
    )

    if (!hasActiveTasks) {
      return
    }

    const timer = window.setInterval(() => {
      void refreshTasks(false, false)
    }, 2500)

    return () => {
      window.clearInterval(timer)
    }
  }, [refreshTasks, tasks])

  function appendTask(task: AudioTask) {
    setPage(1)
    setTaskPagination((current) => {
      const total = current.total + (tasks.some((item) => item.id === task.id) ? 0 : 1)

      return {
        page: 1,
        perPage: pageSize,
        total,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      }
    })
    setTasks((current) =>
      [task, ...current.filter((item) => item.id !== task.id)].slice(0, pageSize)
    )
  }

  function handleTaskDeleted(taskId: string) {
    setTasks((current) => current.filter((task) => task.id !== taskId))
    setTaskPagination((current) => ({
      ...current,
      total: Math.max(0, current.total - 1),
    }))
    void refreshTasks(false, false)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>处理模块</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs
              value={activeModule}
              onValueChange={(value) => setActiveModule(value as AudioModule)}
              className="flex flex-col gap-6"
            >
              <TabsList className="grid !h-11 w-full grid-cols-4 items-center gap-1 rounded-xl bg-muted/70 p-1 sm:!h-12">
                {modules.map((module) => (
                  <TabsTrigger
                    key={module.value}
                    value={module.value}
                    className="box-border !h-9 min-w-0 rounded-lg px-1 text-center text-[13px] leading-none sm:!h-10 sm:px-2 sm:text-sm"
                  >
                    {module.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              {modules.map((module) => (
                <TabsContent
                  key={module.value}
                  value={module.value}
                  className="m-0"
                >
                  <AudioModuleForm config={module} onSubmitted={appendTask} />
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>当前模块</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Metric label="排队" value={countByStatus(tasks, "queued")} />
              <Metric label="运行" value={countByStatus(tasks, "running")} />
              <Metric
                label="完成"
                value={countByStatus(tasks, "completed")}
              />
              <Metric label="失败" value={countByStatus(tasks, "failed")} />
            </div>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-3">
            <PersonalApiSettings />
            <Button
              variant="outline"
              className="w-full sm:w-fit"
              onClick={() => refreshTasks()}
              disabled={loading}
            >
              {loading ? (
                <IconLoader2 data-icon="inline-start" />
              ) : (
                <IconRefresh data-icon="inline-start" />
              )}
              刷新任务
            </Button>
          </CardFooter>
        </Card>
      </div>

      <TaskTable
        tasks={tasks}
        retention={retention}
        pagination={taskPagination}
        onPageChange={setPage}
        onPageSizeChange={(nextPageSize) => {
          setPage(1)
          setPageSize(nextPageSize)
        }}
        onDeleted={handleTaskDeleted}
      />
    </div>
  )
}

function PersonalApiSettings() {
  const [config, setConfig] = useState<MimoConfig>(defaultMimoConfig)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true

    api
      .userMimoConfig()
      .then((value) => {
        if (!active) {
          return
        }

        setConfig({ ...defaultMimoConfig, ...value, api_key: "" })
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [])

  async function savePersonalApi() {
    setSaving(true)

    try {
      const saved = await api.saveUserMimoConfig(config)
      setConfig({ ...defaultMimoConfig, ...saved, api_key: "" })
      toast.success("个人 API 设置已保存")
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "个人 API 设置保存失败")
    } finally {
      setSaving(false)
    }
  }

  const configured = Boolean(config.configured)
  const enabled = Boolean(config.enabled)
  const missingRequiredKey = !configured && !(config.api_key ?? "").trim()
  const statusLabel = loading
    ? "加载中"
    : enabled
      ? "已启用"
      : configured
        ? "未启用"
        : "未配置"
  const summary = loading
    ? "读取个人 API 设置"
    : enabled
      ? "个人配置，不计入额度"
      : configured
        ? "已保存，当前使用系统配置"
        : "当前使用系统配置"

  return (
    <>
      <div className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border bg-background/70 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <IconKey className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-sm font-medium">个人 API</span>
              <Badge variant={enabled ? "secondary" : "outline"}>
                {statusLabel}
              </Badge>
            </div>
            <div className="truncate text-xs text-muted-foreground" title={summary}>
              {summary}
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => setOpen(true)}
        >
          <IconKey data-icon="inline-start" />
          配置
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>个人 API 设置</DialogTitle>
            <DialogDescription>
              与设置页的接口配置同步，启用后优先使用个人 Mimo API。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="workbench-user-api-enabled">
                  启用个人配置
                </FieldLabel>
                <FieldDescription>
                  开启后任务使用个人 API，不消耗套餐额度。
                </FieldDescription>
              </FieldContent>
              <Switch
                id="workbench-user-api-enabled"
                checked={enabled}
                onCheckedChange={(nextEnabled) =>
                  setConfig((current) => ({
                    ...current,
                    enabled: nextEnabled,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="workbench-user-base-url">API 地址</FieldLabel>
              <Input
                id="workbench-user-base-url"
                value={config.base_url ?? ""}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    base_url: event.target.value,
                  }))
                }
                placeholder="https://api.xiaomimimo.com/v1"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="workbench-user-api-key">API Key</FieldLabel>
              <Input
                id="workbench-user-api-key"
                value={config.api_key ?? ""}
                type="password"
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    api_key: event.target.value,
                  }))
                }
                placeholder={configured ? "保持当前密钥" : "输入密钥"}
              />
              <FieldDescription>
                已配置时留空表示继续使用原密钥。
              </FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              onClick={savePersonalApi}
              disabled={saving || missingRequiredKey}
            >
              {saving ? (
                <IconLoader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <IconDeviceFloppy data-icon="inline-start" />
              )}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function AudioModuleForm({
  config,
  onSubmitted,
}: {
  config: ModuleConfig
  onSubmitted: (task: AudioTask) => void
}) {
  const [pending, setPending] = useState(false)
  const submittingRef = useRef(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (submittingRef.current) {
      return
    }

    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const validationError = validateAudioForm(config.value, form)

    if (validationError) {
      toast.error(validationError)
      return
    }

    submittingRef.current = true
    setPending(true)

    try {
      const task = await api.runAudioTask(config.value, form)
      onSubmitted(task)
      toast.success("任务已加入列表")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "任务提交失败")
    } finally {
      submittingRef.current = false
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${config.value}-title`}>任务名称</FieldLabel>
            <Input
              id={`${config.value}-title`}
              name="title"
              maxLength={taskTitleMaxLength}
              placeholder="例如：6 月例会录音"
              required
            />
            <FieldDescription>
              最多 {taskTitleMaxLength} 个字。
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${config.value}-priority`}>优先级</FieldLabel>
            <Select name="priority" defaultValue="normal">
              <SelectTrigger id={`${config.value}-priority`} className="w-full">
                <SelectValue placeholder="选择优先级" />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  <SelectItem value="low">低</SelectItem>
                  <SelectItem value="normal">普通</SelectItem>
                  <SelectItem value="high">高</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>

        {config.value === "speech-recognition" && (
          <RecognitionFields acceptedFiles={config.acceptedFiles} />
        )}
        {config.value === "speech-synthesis" && <SynthesisFields />}
        {config.value === "voice-design" && <VoiceDesignFields />}
        {config.value === "voice-clone" && (
          <VoiceCloneFields acceptedFiles={config.acceptedFiles} />
        )}

        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <IconFileUpload />
            任务结果写入文件索引。
          </div>
          <Button type="submit" aria-busy={pending}>
            {pending ? (
              <IconLoader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <IconPlayerPlay data-icon="inline-start" />
            )}
            {pending ? "提交中" : "运行"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}

function RecognitionFields({ acceptedFiles }: { acceptedFiles: string }) {
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]

    if (file && file.size > recognitionAudioMaxBytes) {
      event.currentTarget.value = ""
      toast.error(recognitionLimitMessage(file.size))
    }
  }

  return (
    <FieldGroup className="grid gap-5 md:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="recognition-file">音频文件</FieldLabel>
        <Input
          id="recognition-file"
          name="audio"
          type="file"
          accept={acceptedFiles}
          onChange={handleFileChange}
          required
        />
        <FieldDescription>
          最大 {recognitionAudioMaxLabel}，Base64 编码后需小于{" "}
          {recognitionBase64MaxLabel}。
        </FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="recognition-language">语言</FieldLabel>
        <Select name="language" defaultValue="zh-CN">
          <SelectTrigger id="recognition-language" className="w-full">
            <SelectValue placeholder="选择语言" />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              <SelectItem value="zh-CN">中文</SelectItem>
              <SelectItem value="en-US">英文</SelectItem>
              <SelectItem value="auto">自动检测</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  )
}

function SynthesisFields() {
  const [text, setText] = useState("")
  const [deliveryMode, setDeliveryMode] = useState("speech")
  const [stylePreset, setStylePreset] = useState("custom")
  const [stylePrompt, setStylePrompt] = useState("")
  const textRef = useRef<HTMLTextAreaElement | null>(null)
  const singingPresets = stylePresets.filter(
    (item) => item.deliveryMode === "singing"
  )
  const defaultSingingPreset = singingPresets[0]
  const visibleStylePresets =
    deliveryMode === "singing"
      ? singingPresets
      : stylePresets.filter((item) => item.deliveryMode !== "singing")

  useEffect(() => {
    const form = textRef.current?.form
    if (!form) {
      return
    }

    function resetControlledFields() {
      setText("")
      setDeliveryMode("speech")
      setStylePreset("custom")
      setStylePrompt("")
    }

    form.addEventListener("mimo-form-reset", resetControlledFields)

    return () => {
      form.removeEventListener("mimo-form-reset", resetControlledFields)
    }
  }, [])

  function applyStylePreset(value: string) {
    setStylePreset(value)

    if (value === "custom") {
      return
    }

    const preset = stylePresets.find((item) => item.value === value)
    if (preset) {
      setStylePrompt(preset.prompt)
    }
  }

  function handleDeliveryModeChange(value: string) {
    setDeliveryMode(value)

    if (value === "singing") {
      setStylePreset(defaultSingingPreset?.value ?? "custom")
      setStylePrompt(defaultSingingPreset?.prompt ?? "")
      return
    }

    const currentPreset = stylePresets.find((item) => item.value === stylePreset)
    if (currentPreset?.deliveryMode === "singing") {
      setStylePreset("custom")
      setStylePrompt("")
    }
  }

  function insertTextTag(value: string) {
    const input = textRef.current
    const start = input?.selectionStart ?? text.length
    const end = input?.selectionEnd ?? text.length
    const nextText = `${text.slice(0, start)}${value}${text.slice(end)}`

    setText(nextText)

    requestAnimationFrame(() => {
      input?.focus()
      const cursor = start + value.length
      input?.setSelectionRange(cursor, cursor)
    })
  }

  return (
    <>
      <Field>
        <FieldLabel htmlFor="synthesis-text">合成文本</FieldLabel>
        <Textarea
          ref={textRef}
          id="synthesis-text"
          name="text"
          placeholder="输入需要合成为语音的正文"
          rows={7}
          value={text}
          onChange={(event) => setText(event.target.value)}
          required
        />
        <div className="flex flex-wrap gap-2">
          {textTagPresets.map((tag) => (
            <Button
              key={tag.label}
              type="button"
              variant="outline"
              size="sm"
              title={tag.value}
              onClick={() => insertTextTag(tag.value)}
            >
              {tag.label}
            </Button>
          ))}
        </div>
      </Field>
      <FieldGroup className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        <Field>
          <FieldLabel htmlFor="synthesis-delivery-mode">合成模式</FieldLabel>
          <Select
            name="delivery_mode"
            value={deliveryMode}
            onValueChange={handleDeliveryModeChange}
          >
            <SelectTrigger id="synthesis-delivery-mode" className="w-full">
              <SelectValue placeholder="选择模式" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                {deliveryModeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="synthesis-style-preset">
            自然语言预设
          </FieldLabel>
          <Select value={stylePreset} onValueChange={applyStylePreset}>
            <SelectTrigger id="synthesis-style-preset" className="w-full">
              <SelectValue placeholder="选择预设" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                <SelectItem value="custom">自定义</SelectItem>
                {visibleStylePresets.map((preset) => (
                  <SelectItem key={preset.value} value={preset.value}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="synthesis-voice">音色</FieldLabel>
          <Select name="voice" defaultValue="mimo_default">
            <SelectTrigger id="synthesis-voice" className="w-full">
              <SelectValue placeholder="选择音色" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                {ttsVoices.map((voice) => (
                  <SelectItem key={voice.value} value={voice.value}>
                    {voice.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <SpeechRateField id="synthesis-speech-rate" />
        <Field>
          <FieldLabel htmlFor="synthesis-format">输出格式</FieldLabel>
          <Select name="response_format" defaultValue="wav">
            <SelectTrigger id="synthesis-format" className="w-full">
              <SelectValue placeholder="选择格式" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                <SelectItem value="wav">WAV</SelectItem>
                <SelectItem value="mp3">MP3</SelectItem>
                <SelectItem value="ogg">OGG</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      <Field>
        <FieldLabel htmlFor="synthesis-style">风格指令</FieldLabel>
        <Textarea
          id="synthesis-style"
          name="style_prompt"
          placeholder="专业、清晰、稳定"
          rows={3}
          value={stylePrompt}
          onChange={(event) => {
            setStylePrompt(event.target.value)
            setStylePreset("custom")
          }}
        />
      </Field>
    </>
  )
}

function VoiceDesignFields() {
  return (
    <>
      <Field>
        <FieldLabel htmlFor="design-brief">音色要求</FieldLabel>
        <Textarea
          id="design-brief"
          name="description"
          placeholder="描述音色方向、语气、适用场景"
          rows={5}
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="design-script">试听文本</FieldLabel>
        <Input
          id="design-script"
          name="text"
          placeholder="用于生成样音的短文本"
          required
        />
      </Field>
      <FieldGroup className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <SpeechRateField id="design-speech-rate" />
        <Field>
          <FieldHelpLabel
            htmlFor="design-optimize-preview"
            help="开启后接口会按音色目标润色试听文本；关闭时严格使用输入文本。"
          >
            文本优化
          </FieldHelpLabel>
          <div className="flex h-9 items-center rounded-md border px-3">
            <Switch
              id="design-optimize-preview"
              name="optimize_text_preview"
              value="1"
              size="sm"
            />
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="design-format">输出格式</FieldLabel>
          <Select name="response_format" defaultValue="wav">
            <SelectTrigger id="design-format" className="w-full">
              <SelectValue placeholder="选择格式" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                <SelectItem value="wav">WAV</SelectItem>
                <SelectItem value="mp3">MP3</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
    </>
  )
}

function VoiceCloneFields({ acceptedFiles }: { acceptedFiles: string }) {
  return (
    <>
      <FieldGroup className="grid gap-5 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="clone-samples">授权样本</FieldLabel>
          <Input
            id="clone-samples"
            name="audio"
            type="file"
            accept={acceptedFiles}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="clone-speaker">音色名称</FieldLabel>
          <Input
            id="clone-speaker"
            name="label"
            placeholder="例如：客服女声 A"
            required
          />
        </Field>
      </FieldGroup>
      <Field>
        <FieldLabel htmlFor="clone-text">合成文本</FieldLabel>
        <Textarea
          id="clone-text"
          name="text"
          placeholder="输入用于验证克隆音色的文本"
          rows={4}
          required
        />
      </Field>
      <Field
        orientation="horizontal"
        className="rounded-lg border bg-muted/30 p-3"
      >
        <Checkbox
          id="clone-sample-authorization"
          name="sample_authorization_confirmed"
          value="1"
        />
        <FieldContent>
          <FieldLabel htmlFor="clone-sample-authorization">
            我确认拥有该声音样本的使用授权
          </FieldLabel>
          <FieldDescription>
            请仅上传本人声音或已取得明确授权的样本，生成内容需自行承担合规责任。
          </FieldDescription>
        </FieldContent>
      </Field>
      <FieldGroup className="grid gap-5 md:grid-cols-2">
        <SpeechRateField id="clone-speech-rate" />
        <Field>
          <FieldLabel htmlFor="clone-format">输出格式</FieldLabel>
          <Select name="response_format" defaultValue="wav">
            <SelectTrigger id="clone-format" className="w-full">
              <SelectValue placeholder="选择格式" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectGroup>
                <SelectItem value="wav">WAV</SelectItem>
                <SelectItem value="mp3">MP3</SelectItem>
                <SelectItem value="ogg">OGG</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
    </>
  )
}

function SpeechRateField({ id }: { id: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>语速</FieldLabel>
      <Select name="speech_rate" defaultValue="off">
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="选择语速" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectGroup>
            {speechRateOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}

function TaskTable({
  tasks,
  retention,
  pagination,
  onPageChange,
  onPageSizeChange,
  onDeleted,
}: {
  tasks: AudioTask[]
  retention: AudioRetentionConfig | null
  pagination: PaginationMeta
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  onDeleted: (taskId: string) => void
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function deleteTask(task: AudioTask) {
    setDeletingId(task.id)

    try {
      await api.deleteTask(task.id)
      onDeleted(task.id)
      toast.success("任务已删除")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "任务删除失败")
    } finally {
      setDeletingId(null)
    }
  }

  if (pagination.total === 0) {
    return (
      <Empty className="border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconClipboardList />
          </EmptyMedia>
          <EmptyTitle>暂无任务</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Badge variant="secondary">等待提交</Badge>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>任务列表</CardTitle>
        <RetentionBadge retention={retention} />
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>任务</TableHead>
                <TableHead>模块</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>进度</TableHead>
                <TableHead>提交时间</TableHead>
                <TableHead className="text-right">详情</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{task.title}</span>
                    </div>
                  </TableCell>
                  <TableCell>{moduleLabels[task.module]}</TableCell>
                  <TableCell>
                    <StatusBadge status={task.status} />
                  </TableCell>
                  <TableCell className="min-w-32">
                    <div className="flex items-center gap-2">
                      <Progress value={task.progress} />
                      <span className="w-10 text-xs text-muted-foreground">
                        {task.progress}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{task.createdAt}</TableCell>
                  <TableCell className="text-right">
                    <TaskDetailDialog task={task} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={deletingId === task.id}
                        >
                          <IconTrash data-icon="inline-start" />
                          删除
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>删除任务</DialogTitle>
                          <DialogDescription>
                            删除后将同步移除任务记录和关联音频文件。
                          </DialogDescription>
                        </DialogHeader>
                        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                          <div className="font-medium" title={task.title}>
                            {task.title}
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            variant="destructive"
                            onClick={() => void deleteTask(task)}
                            disabled={deletingId === task.id}
                          >
                            {deletingId === task.id ? (
                              <IconLoader2 data-icon="inline-start" />
                            ) : (
                              <IconTrash data-icon="inline-start" />
                            )}
                            确认删除
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4">
          <TablePagination
            total={pagination.total}
            page={pagination.page}
            pageSize={pagination.perPage}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function RetentionBadge({
  retention,
}: {
  retention: AudioRetentionConfig | null
}) {
  const days = Number(retention?.retention_days ?? retention?.retentionDays ?? 0)
  const label = retention
    ? retention.enabled
      ? `文件保存 ${days} 天`
      : "文件长期保存"
    : "文件保存策略加载中"

  return (
    <div className="flex w-fit items-center gap-2 rounded-full border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
      <IconClock className="size-3.5 text-primary" />
      <span>{label}</span>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold">{value}</span>
    </div>
  )
}

function countByStatus(tasks: AudioTask[], status: AudioTask["status"]) {
  return tasks.filter((task) => task.status === status).length
}

function validateAudioForm(module: AudioModule, form: FormData) {
  const title = String(form.get("title") ?? "").trim()

  if (title.length > taskTitleMaxLength) {
    return `任务名称最多 ${taskTitleMaxLength} 个字`
  }

  if (module === "voice-clone" && form.get("sample_authorization_confirmed") !== "1") {
    return "请确认拥有该声音样本的使用授权"
  }

  if (module !== "speech-recognition") {
    return null
  }

  const audio = form.get("audio")

  if (audio instanceof File && audio.size > recognitionAudioMaxBytes) {
    return recognitionLimitMessage(audio.size)
  }

  return null
}

function recognitionLimitMessage(fileSize: number) {
  return `语音识别文件不能超过 ${recognitionAudioMaxLabel}，当前约 ${formatFileSize(
    fileSize
  )}。`
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
