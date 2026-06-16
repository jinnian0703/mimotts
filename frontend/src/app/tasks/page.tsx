"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  IconAlertCircle,
  IconClipboardList,
  IconDownload,
  IconLoader2,
  IconPlayerPlay,
  IconRefresh,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/components/auth-gate"
import { PageHeading } from "@/components/page-heading"
import { StatusBadge } from "@/components/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
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
import { api, apiPath } from "@/lib/api"
import type { AudioModule, AudioTask, TaskStatus } from "@/lib/types"

const moduleLabels: Record<AudioModule, string> = {
  "speech-recognition": "语音转文字",
  "speech-synthesis": "文字转语音",
  "voice-design": "音色设计",
  "voice-clone": "声音克隆",
}

const statusLabels: Record<TaskStatus, string> = {
  queued: "排队",
  running: "运行",
  completed: "完成",
  failed: "失败",
}

type FilterValue = "all"

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

export default function TasksPage() {
  const router = useRouter()
  const currentUser = useCurrentUser()
  const isAdmin = currentUser?.role === "admin"
  const [tasks, setTasks] = useState<AudioTask[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [moduleFilter, setModuleFilter] = useState<AudioModule | FilterValue>("all")
  const [statusFilter, setStatusFilter] = useState<TaskStatus | FilterValue>("all")
  const [userFilter, setUserFilter] = useState("all")
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  useEffect(() => {
    if (currentUser && !isAdmin) {
      router.replace("/dashboard")
    }
  }, [currentUser, isAdmin, router])

  useEffect(() => {
    if (isAdmin) {
      void refresh()
    }
  }, [isAdmin])

  const users = useMemo(() => {
    const items = new Map<string, string>()

    for (const task of tasks) {
      const id = task.userId ?? ""
      if (!id) {
        continue
      }

      items.set(id, task.userName ?? task.userEmail ?? `用户 ${id}`)
    }

    return Array.from(items, ([id, label]) => ({ id, label }))
  }, [tasks])

  const filteredTasks = useMemo(() => {
    const keyword = query.trim().toLowerCase()

    return tasks.filter((task) => {
      const searchable = [
        task.id,
        task.title,
        task.summary,
        task.userName,
        task.userEmail,
        task.userId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()

      return (
        (!keyword || searchable.includes(keyword)) &&
        (moduleFilter === "all" || task.module === moduleFilter) &&
        (statusFilter === "all" || task.status === statusFilter) &&
        (userFilter === "all" || task.userId === userFilter)
      )
    })
  }, [moduleFilter, query, statusFilter, tasks, userFilter])

  const selectedVisibleIds = filteredTasks
    .filter((task) => selectedIds.includes(task.id))
    .map((task) => task.id)

  async function refresh() {
    setLoading(true)

    try {
      const nextTasks = await api.adminTasks()
      setTasks(nextTasks)
      setSelectedIds([])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "任务列表获取失败")
    } finally {
      setLoading(false)
    }
  }

  function toggleTask(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? [...new Set([...current, id])] : current.filter((item) => item !== id)
    )
  }

  function toggleVisible(checked: boolean) {
    const visibleIds = filteredTasks.map((task) => task.id)

    setSelectedIds((current) =>
      checked
        ? [...new Set([...current, ...visibleIds])]
        : current.filter((id) => !visibleIds.includes(id))
    )
  }

  async function deleteTask(task: AudioTask) {
    setDeletingId(task.id)

    try {
      await api.deleteAdminTask(task.id)
      setTasks((current) => current.filter((item) => item.id !== task.id))
      setSelectedIds((current) => current.filter((id) => id !== task.id))
      toast.success("任务已删除")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "任务删除失败")
    } finally {
      setDeletingId(null)
    }
  }

  async function bulkDelete() {
    if (selectedIds.length === 0) {
      toast.error("请选择任务")
      return
    }

    setBulkDeleting(true)

    try {
      const deletedIds = await api.bulkDeleteAdminTasks(selectedIds)
      setTasks((current) => current.filter((task) => !deletedIds.includes(task.id)))
      setSelectedIds([])
      toast.success("批量删除已完成")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量删除失败")
    } finally {
      setBulkDeleting(false)
    }
  }

  return (
    <>
      <PageHeading
        title="任务管理"
        actions={
          <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
            {loading ? (
              <IconLoader2 data-icon="inline-start" />
            ) : (
              <IconRefresh data-icon="inline-start" />
            )}
            刷新
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <CardTitle>任务列表</CardTitle>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{tasks.length} 条记录</Badge>
                <Badge variant="outline">{filteredTasks.length} 条匹配</Badge>
                <Badge variant="outline">{selectedIds.length} 条已选</Badge>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_150px_130px_160px_auto]">
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索任务、用户、摘要"
                  className="pl-8"
                />
              </div>
              <Select
                value={moduleFilter}
                onValueChange={(value) =>
                  setModuleFilter(value as AudioModule | FilterValue)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="模块" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">全部模块</SelectItem>
                    {Object.entries(moduleLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as TaskStatus | FilterValue)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">全部状态</SelectItem>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="用户" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">全部用户</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="destructive"
                    disabled={bulkDeleting || selectedIds.length === 0}
                  >
                    <IconTrash data-icon="inline-start" />
                    批量删除
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>批量删除任务</DialogTitle>
                    <DialogDescription>
                      将删除选中任务以及关联音频文件。
                    </DialogDescription>
                  </DialogHeader>
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                    已选择 {selectedIds.length} 条任务。
                  </div>
                  <DialogFooter>
                    <Button
                      variant="destructive"
                      onClick={() => void bulkDelete()}
                      disabled={bulkDeleting}
                    >
                      {bulkDeleting ? (
                        <IconLoader2 data-icon="inline-start" />
                      ) : (
                        <IconTrash data-icon="inline-start" />
                      )}
                      确认删除
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTasks.length === 0 ? (
            <Empty className="border bg-card">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconClipboardList />
                </EmptyMedia>
                <EmptyTitle>暂无任务</EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <Badge variant="secondary">等待记录</Badge>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Checkbox
                        checked={
                          filteredTasks.length > 0 &&
                          selectedVisibleIds.length === filteredTasks.length
                        }
                        onCheckedChange={(checked) => toggleVisible(Boolean(checked))}
                      />
                    </TableHead>
                    <TableHead>任务</TableHead>
                    <TableHead>用户</TableHead>
                    <TableHead>模块</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>进度</TableHead>
                    <TableHead>时间</TableHead>
                    <TableHead className="text-right">详情</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(task.id)}
                          onCheckedChange={(checked) =>
                            toggleTask(task.id, Boolean(checked))
                          }
                        />
                      </TableCell>
                      <TableCell className="min-w-56">
                        <div className="flex flex-col gap-1">
                          <span
                            className="max-w-[22rem] truncate font-medium"
                            title={task.title}
                          >
                            {task.title}
                          </span>
                          <span
                            className="max-w-[24rem] truncate text-xs text-muted-foreground"
                            title={task.summary || task.id}
                          >
                            {task.summary || task.id}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-44">
                        <div className="flex flex-col gap-1">
                          <span
                            className="max-w-40 truncate font-medium"
                            title={task.userName ?? task.userEmail ?? task.userId}
                          >
                            {task.userName ?? task.userEmail ?? "-"}
                          </span>
                          <span
                            className="max-w-44 truncate text-xs text-muted-foreground"
                            title={task.userEmail ?? task.userId ?? ""}
                          >
                            {task.userEmail ?? task.userId ?? ""}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {moduleLabels[task.module]}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={task.status} />
                      </TableCell>
                      <TableCell className="min-w-40">
                        <div className="flex items-center gap-3">
                          <Progress value={task.progress} className="h-1.5" />
                          <span className="w-10 text-xs text-muted-foreground">
                            {task.progress}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {task.createdAt}
                      </TableCell>
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
                                {task.userName ?? task.userEmail ?? "未知用户"}
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
          )}
        </CardContent>
      </Card>
    </>
  )
}

function TaskDetailDialog({ task }: { task: AudioTask }) {
  const canPlay =
    task.status === "completed" &&
    Boolean(task.outputUrl) &&
    audioOutputModules.has(task.module)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <IconPlayerPlay data-icon="inline-start" />
          详情
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
          <DialogDescription>{task.summary ?? "暂无结果摘要。"}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <DetailItem label="任务编号" value={task.id} />
          <DetailItem label="模块" value={moduleLabels[task.module]} />
          <DetailItem label="状态" value={statusLabels[task.status]} />
          <DetailItem label="进度" value={`${task.progress}%`} />
          <DetailItem
            label="用户"
            value={task.userName ?? task.userEmail ?? task.userId ?? "-"}
          />
          <DetailItem label="邮箱" value={task.userEmail ?? "-"} />
          <DetailItem label="创建时间" value={task.createdAt ?? "-"} />
          <DetailItem label="开始时间" value={task.startedAt ?? "-"} />
          <DetailItem label="完成时间" value={task.completedAt ?? "-"} />
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
          <DetailItem
            label="接口来源"
            value={apiConfigSourceLabel(task.apiConfigSource)}
          />
          <DetailItem
            label="计费状态"
            value={billingStatusLabel(task.billable)}
          />
        </div>

        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="font-medium">处理结果</div>
            <Badge variant="secondary">{moduleLabels[task.module]}</Badge>
          </div>
          <Progress value={task.progress} className="mb-4 h-1.5" />
          {canPlay && <TaskAudioPlayback task={task} />}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {task.outputUrl ? (
              <Button asChild>
                <a href={apiPath(task.outputUrl)} download>
                  <IconDownload data-icon="inline-start" />
                  {moduleOutputLabels[task.module] ?? "下载结果"}
                </a>
              </Button>
            ) : (
              <Button disabled variant="outline">
                <IconDownload data-icon="inline-start" />
                暂无结果
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
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

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium" title={value}>
        {value}
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

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
