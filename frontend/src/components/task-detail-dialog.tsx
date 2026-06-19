"use client"

import { useEffect, useState } from "react"
import {
  IconAlertCircle,
  IconDownload,
  IconListDetails,
  IconLoader2,
  IconCreditCard,
  IconFile,
  IconFileText,
} from "@tabler/icons-react"

import { apiPath } from "@/lib/api"
import type { AudioModule, AudioTask, TaskRequestSummary } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"

const moduleLabels: Record<AudioModule, string> = {
  "speech-recognition": "语音识别",
  "speech-synthesis": "语音合成",
  "voice-design": "音色设计",
  "voice-clone": "声音克隆",
}

const statusLabels: Record<AudioTask["status"], string> = {
  queued: "排队中",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
}

const audioOutputModules = new Set<AudioModule>([
  "speech-synthesis",
  "voice-design",
  "voice-clone",
])

const moduleOutputLabels: Record<AudioModule, string> = {
  "speech-recognition": "下载逐字稿",
  "speech-synthesis": "下载音频",
  "voice-design": "下载样音",
  "voice-clone": "下载验证音频",
}

const textOutputModules = new Set<AudioModule>(["speech-recognition"])

export function TaskDetailDialog({
  task,
  showUser = false,
}: {
  task: AudioTask
  showUser?: boolean
}) {
  const canPlay =
    task.status === "completed" &&
    Boolean(task.outputUrl) &&
    audioOutputModules.has(task.module)
  const canShowText =
    task.status === "completed" &&
    Boolean(task.outputUrl) &&
    (textOutputModules.has(task.module) || isTextOutput(task))
  const requestSummary = normalizeRequestSummary(task.requestSummary)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <IconListDetails data-icon="inline-start" />
          详情
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-hidden p-0 sm:max-w-[min(1120px,calc(100vw-4rem))]">
        <div className="border-b px-5 py-4 pr-12">
          <DialogHeader className="gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-lg">{task.title}</DialogTitle>
              <Badge variant="secondary">{statusLabels[task.status]}</Badge>
              <Badge variant="outline">{moduleLabels[task.module]}</Badge>
            </div>
            <DialogDescription>
              {task.summary ?? "暂无结果摘要。"}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="max-h-[calc(88vh-96px)] overflow-y-auto px-5 py-5">
          <div className="space-y-5">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryMetric label="任务编号" value={task.id} />
                <SummaryMetric label="进度" value={`${task.progress}%`} />
                <SummaryMetric
                  label="完成时间"
                  value={task.completedAt ?? task.createdAt ?? "-"}
                />
              </div>

              <ResultPanel task={task} canPlay={canPlay} />
            </div>

            {canShowText && <TaskTextResult task={task} />}

            <RequestSummaryPanel summary={requestSummary} />

            <MetadataPanel task={task} showUser={showUser} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TaskTextResult({ task }: { task: AudioTask }) {
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadText() {
      if (!task.outputUrl) {
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const response = await fetch(apiPath(task.outputUrl), {
          credentials: "include",
          headers: {
            Accept: "text/plain,*/*",
          },
        })

        if (!response.ok) {
          throw new Error(`文本加载失败：${response.status}`)
        }

        const body = await response.text()

        if (active) {
          setText(body.trim())
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "文本加载失败"
          )
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadText()

    return () => {
      active = false
    }
  }, [task.outputUrl])

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-medium">
          <IconFileText className="size-4 text-primary" />
          {task.module === "speech-recognition" ? "识别文本" : "文本结果"}
        </div>
        <Badge variant="secondary">直接展示</Badge>
      </div>

      {loading && (
        <div className="flex items-center gap-2 rounded-lg border bg-background p-4 text-sm text-muted-foreground">
          <IconLoader2 className="size-4 animate-spin" />
          文本加载中
        </div>
      )}

      {!loading && error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}

      {!loading && !error && (
        <div className="max-h-80 overflow-auto rounded-lg border bg-background p-4 text-sm leading-7">
          {text ? (
            <div className="whitespace-pre-wrap break-words">{text}</div>
          ) : (
            <div className="text-muted-foreground">暂无文本内容</div>
          )}
        </div>
      )}
    </div>
  )
}

function RequestSummaryPanel({ summary }: { summary: TaskRequestSummary }) {
  const sections = summary.sections ?? []
  const options = summary.options ?? []
  const hasContent = sections.length > 0 || options.length > 0

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="font-medium">文本指令</div>
        <Badge variant="outline">{sections.length + options.length} 项</Badge>
      </div>
      {!hasContent && (
        <div className="text-sm text-muted-foreground">暂无文本指令记录</div>
      )}
      {sections.length > 0 && (
        <div className="grid gap-3">
          {sections.map((section) => (
            <div
              key={`${section.label}-${section.value}`}
              className="rounded-lg border bg-background p-4"
            >
              <div className="mb-2 text-xs text-muted-foreground">
                {section.label}
              </div>
              <div className="whitespace-pre-wrap break-words text-sm leading-6">
                {String(section.value)}
              </div>
            </div>
          ))}
        </div>
      )}
      {options.length > 0 && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {options.map((option) => (
            <DetailItem
              key={`${option.label}-${option.value}`}
              label={option.label}
              value={formatSummaryValue(option.value)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b py-2 last:border-b-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium" title={value}>
        {value}
      </div>
    </div>
  )
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-background px-3 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium" title={value}>
        {value}
      </div>
    </div>
  )
}

function ResultPanel({
  task,
  canPlay,
}: {
  task: AudioTask
  canPlay: boolean
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="font-medium">处理结果</div>
        <Badge variant="secondary">{moduleLabels[task.module]}</Badge>
      </div>
      <Progress value={task.progress} className="mb-4 h-1.5" />
      {task.status === "failed" && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 break-words">
            {task.errorMessage ?? task.summary ?? "任务执行失败"}
          </span>
        </div>
      )}
      {canPlay && <TaskAudioPlayback task={task} />}
      <div className="mt-4">
        {task.outputUrl ? (
          <Button asChild className="w-full">
            <a href={apiPath(task.outputUrl)} download>
              <IconDownload data-icon="inline-start" />
              {moduleOutputLabels[task.module] ?? "下载结果"}
            </a>
          </Button>
        ) : (
          <Button disabled variant="outline" className="w-full">
            <IconDownload data-icon="inline-start" />
            暂无结果
          </Button>
        )}
      </div>
    </div>
  )
}

function MetadataPanel({
  task,
  showUser,
}: {
  task: AudioTask
  showUser: boolean
}) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="mb-4 flex items-center gap-2 font-medium">
        <IconListDetails className="size-4 text-primary" />
        任务信息
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0">
          <div className="mb-2 text-sm font-medium text-muted-foreground">
            任务
          </div>
          <div className="grid gap-1">
            <DetailItem label="模块" value={moduleLabels[task.module]} />
            <DetailItem label="状态" value={statusLabels[task.status]} />
            {showUser && (
              <>
                <DetailItem
                  label="用户"
                  value={task.userName ?? task.userEmail ?? task.userId ?? "-"}
                />
                <DetailItem label="邮箱" value={task.userEmail ?? "-"} />
              </>
            )}
            <DetailItem label="创建时间" value={task.createdAt ?? "-"} />
            <DetailItem label="开始时间" value={task.startedAt ?? "-"} />
            <DetailItem label="完成时间" value={task.completedAt ?? "-"} />
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <IconFile className="size-4" />
            文件
          </div>
          <div className="grid gap-1">
            <DetailItem label="文件名称" value={task.fileName ?? "-"} />
            <DetailItem label="文件类型" value={task.fileMimeType ?? "-"} />
            <DetailItem
              label="文件大小"
              value={
                typeof task.fileSize === "number"
                  ? formatFileSize(task.fileSize)
                  : "-"
              }
            />
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <IconCreditCard className="size-4" />
            计费
          </div>
          <div className="grid gap-1">
            <DetailItem
              label="接口来源"
              value={apiConfigSourceLabel(task.apiConfigSource)}
            />
            <DetailItem
              label="计费状态"
              value={billingStatusLabel(task.billable)}
            />
            <DetailItem
              label="额度消耗"
              value={
                typeof task.quotaCost === "number" ? String(task.quotaCost) : "-"
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function TaskAudioPlayback({ task }: { task: AudioTask }) {
  const [source, setSource] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null

    async function loadAudio() {
      if (!task.outputUrl) {
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const response = await fetch(apiPath(task.outputUrl), {
          credentials: "include",
          headers: {
            Accept: "audio/*,application/octet-stream",
          },
        })

        if (!response.ok) {
          throw new Error(`音频加载失败：${response.status}`)
        }

        const blob = await response.blob()
        objectUrl = URL.createObjectURL(blob)

        if (active) {
          setSource(objectUrl)
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "音频加载失败"
          )
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadAudio()

    return () => {
      active = false
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [task.outputUrl])

  return (
    <div className="rounded-lg border bg-background p-3">
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconLoader2 className="size-4 animate-spin" />
          音频加载中
        </div>
      )}
      {!loading && error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <IconAlertCircle className="size-4" />
          {error}
        </div>
      )}
      {!loading && source && (
        <audio className="w-full" controls preload="metadata" src={source} />
      )}
    </div>
  )
}

function normalizeRequestSummary(
  summary: TaskRequestSummary | null | undefined
): TaskRequestSummary {
  return {
    sections: (summary?.sections ?? [])
      .map((item) => ({
        label: item.label,
        value: formatSummaryValue(item.value),
      }))
      .filter((item) => item.label && item.value),
    options: (summary?.options ?? [])
      .map((item) => ({
        label: item.label,
        value: formatSummaryValue(item.value),
      }))
      .filter((item) => item.label && item.value),
  }
}

function formatSummaryValue(value: string | number | boolean | null | undefined) {
  if (value === true) return "是"
  if (value === false) return "否"
  if (value === null || value === undefined) return ""
  return String(value).trim()
}

function isTextOutput(task: AudioTask) {
  const mimeType = (task.fileMimeType ?? "").toLowerCase()
  const fileName = (task.fileName ?? "").toLowerCase()

  return mimeType.startsWith("text/") || fileName.endsWith(".txt")
}

function apiConfigSourceLabel(source: AudioTask["apiConfigSource"]) {
  if (source === "user") return "个人配置"
  if (source === "system") return "系统配置"
  return "-"
}

function billingStatusLabel(billable: AudioTask["billable"]) {
  if (billable === true) return "计入额度"
  if (billable === false) return "不计入额度"
  return "-"
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
