"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  IconClipboardList,
  IconLoader2,
  IconRefresh,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/components/auth-gate"
import { PageHeading } from "@/components/page-heading"
import { StatusBadge } from "@/components/status-badge"
import { TablePagination } from "@/components/table-pagination"
import { TaskDetailDialog } from "@/components/task-detail-dialog"
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
import { api } from "@/lib/api"
import type {
  AudioModule,
  AudioTask,
  PaginationMeta,
  TaskStatus,
  TaskUserOption,
} from "@/lib/types"

const moduleLabels: Record<AudioModule, string> = {
  "speech-recognition": "语音识别",
  "speech-synthesis": "语音合成",
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
const defaultPageSize = 20
const defaultTaskPagination: PaginationMeta = {
  page: 1,
  perPage: defaultPageSize,
  total: 0,
  pageCount: 1,
}

export default function TasksPage() {
  const router = useRouter()
  const currentUser = useCurrentUser()
  const isAdmin = currentUser?.role === "admin"
  const [tasks, setTasks] = useState<AudioTask[]>([])
  const [taskPagination, setTaskPagination] =
    useState<PaginationMeta>(defaultTaskPagination)
  const [userOptions, setUserOptions] = useState<TaskUserOption[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [moduleFilter, setModuleFilter] = useState<AudioModule | FilterValue>("all")
  const [statusFilter, setStatusFilter] = useState<TaskStatus | FilterValue>("all")
  const [userFilter, setUserFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)

  useEffect(() => {
    if (currentUser && !isAdmin) {
      router.replace("/dashboard")
    }
  }, [currentUser, isAdmin, router])

  const selectedVisibleIds = tasks
    .filter((task) => selectedIds.includes(task.id))
    .map((task) => task.id)

  const loadTaskPage = useCallback(
    () =>
      api.adminTaskPage({
        page,
        pageSize,
        query,
        module: moduleFilter,
        status: statusFilter,
        userId: userFilter,
      }),
    [moduleFilter, page, pageSize, query, statusFilter, userFilter]
  )

  const refresh = useCallback(async () => {
    setLoading(true)

    try {
      const response = await loadTaskPage()
      setTasks(response.tasks)
      setTaskPagination(response.pagination)
      setUserOptions(response.filters?.users ?? [])
      setSelectedIds([])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "任务列表获取失败")
    } finally {
      setLoading(false)
    }
  }, [loadTaskPage])

  useEffect(() => {
    if (!isAdmin) {
      return
    }

    let active = true

    async function load() {
      try {
        const response = await loadTaskPage()
        if (!active) {
          return
        }

        setTasks(response.tasks)
        setTaskPagination(response.pagination)
        setUserOptions(response.filters?.users ?? [])
        setSelectedIds([])
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

    void load()

    return () => {
      active = false
    }
  }, [isAdmin, loadTaskPage])

  function toggleTask(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? [...new Set([...current, id])] : current.filter((item) => item !== id)
    )
  }

  function toggleVisible(checked: boolean) {
    const visibleIds = tasks.map((task) => task.id)

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
      setTaskPagination((current) => ({
        ...current,
        total: Math.max(0, current.total - 1),
      }))
      setSelectedIds((current) => current.filter((id) => id !== task.id))
      void refresh()
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
      void refresh()
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
                <Badge variant="secondary">
                  当前页 {tasks.length} 条
                </Badge>
                <Badge variant="outline">{taskPagination.total} 条匹配</Badge>
                <Badge variant="outline">{selectedIds.length} 条已选</Badge>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_150px_130px_160px_auto]">
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setPage(1)
                  }}
                  placeholder="搜索任务、用户、摘要"
                  className="pl-8"
                />
              </div>
              <Select
                value={moduleFilter}
                onValueChange={(value) => {
                  setModuleFilter(value as AudioModule | FilterValue)
                  setPage(1)
                }}
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
                onValueChange={(value) => {
                  setStatusFilter(value as TaskStatus | FilterValue)
                  setPage(1)
                }}
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
              <Select
                value={userFilter}
                onValueChange={(value) => {
                  setUserFilter(value)
                  setPage(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="用户" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">全部用户</SelectItem>
                    {userOptions.map((user) => (
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
          {tasks.length === 0 ? (
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
                          tasks.length > 0 &&
                          selectedVisibleIds.length === tasks.length
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
                  {tasks.map((task) => (
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
                          {task.filesPrunedAt && (
                            <Badge variant="outline" className="w-fit">
                              音频已清理
                            </Badge>
                          )}
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
                        <TaskDetailDialog task={task} showUser />
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
              <div className="mt-4">
                <TablePagination
                  total={taskPagination.total}
                  page={taskPagination.page}
                  pageSize={taskPagination.perPage}
                  onPageChange={setPage}
                  onPageSizeChange={(nextPageSize) => {
                    setPageSize(nextPageSize)
                    setPage(1)
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
