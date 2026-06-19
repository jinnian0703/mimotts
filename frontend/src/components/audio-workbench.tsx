"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  IconClipboardList,
  IconFileUpload,
  IconLoader2,
  IconPlayerPlay,
  IconRefresh,
  IconTrash,
  IconClock,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import type { AudioModule, AudioRetentionConfig, AudioTask } from "@/lib/types"
import { StatusBadge } from "@/components/status-badge"
import { TaskDetailDialog } from "@/components/task-detail-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  { value: "x-slow", label: "很慢" },
  { value: "slow", label: "偏慢" },
  { value: "normal", label: "正常" },
  { value: "fast", label: "偏快" },
  { value: "x-fast", label: "很快" },
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
  { label: "小声", value: "（小声）" },
  { label: "加快", value: "（语速变快）" },
  { label: "放慢", value: "（语速变慢）" },
  { label: "重读", value: "（重读）" },
]

export function AudioWorkbench() {
  const [tasks, setTasks] = useState<AudioTask[]>([])
  const [activeModule, setActiveModule] =
    useState<AudioModule>("speech-recognition")
  const [loading, setLoading] = useState(true)
  const [retention, setRetention] = useState<AudioRetentionConfig | null>(null)

  const refreshTasks = useCallback(async (notify = true, showLoading = true) => {
    if (showLoading) {
      setLoading(true)
    }

    try {
      const [data, retentionConfig] = await Promise.all([
        api.tasks(),
        api.audioRetention().catch(() => null),
      ])
      setTasks(data)
      if (retentionConfig) {
        setRetention(retentionConfig)
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
  }, [])

  useEffect(() => {
    void refreshTasks(false)
  }, [refreshTasks])

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
    setTasks((current) => [task, ...current.filter((item) => item.id !== task.id)])
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
              className="flex flex-col gap-5"
            >
              <TabsList className="grid h-auto grid-cols-2 gap-1 md:grid-cols-4">
                {modules.map((module) => (
                  <TabsTrigger key={module.value} value={module.value}>
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
          <CardFooter>
            <Button
              variant="outline"
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
        onDeleted={(taskId) =>
          setTasks((current) => current.filter((task) => task.id !== taskId))
        }
      />
    </div>
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
              placeholder="例如：6 月例会录音"
              required
            />
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
  return (
    <FieldGroup className="grid gap-5 md:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="recognition-file">音频文件</FieldLabel>
          <Input
          id="recognition-file"
          name="audio"
          type="file"
          accept={acceptedFiles}
          required
        />
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
  const [stylePreset, setStylePreset] = useState("custom")
  const [stylePrompt, setStylePrompt] = useState("")
  const textRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const form = textRef.current?.form
    if (!form) {
      return
    }

    function resetControlledFields() {
      setText("")
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
                {stylePresets.map((preset) => (
                  <SelectItem key={preset.value} value={preset.value}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className="xl:col-span-2">
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
      <FieldGroup className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="design-script">试听文本</FieldLabel>
          <Input
            id="design-script"
            name="text"
            placeholder="用于生成样音的短文本"
            required
          />
        </Field>
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
      <Select name="speech_rate" defaultValue="normal">
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
  onDeleted,
}: {
  tasks: AudioTask[]
  retention: AudioRetentionConfig | null
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

  if (tasks.length === 0) {
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
                      <span className="text-xs text-muted-foreground">
                        {task.id}
                      </span>
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
                          <div className="mt-1 text-xs text-muted-foreground">
                            {task.id}
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
