"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  IconApi,
  IconArrowRight,
  IconBolt,
  IconCheck,
  IconClockHour4,
  IconCreditCard,
  IconHistory,
  IconMailCheck,
  IconPackage,
  IconPercentage,
  IconRefresh,
  IconReceipt2,
  IconServerCog,
  IconShieldCheck,
  IconTrash,
  IconUsers,
  IconWaveSine,
  IconWorldWww,
  IconX,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/components/auth-gate"
import { PageHeading } from "@/components/page-heading"
import { StatusBadge } from "@/components/status-badge"
import { formatChinaDateTime } from "@/lib/china-time"
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
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import type {
  AudioModule,
  AudioTask,
  BillingConfig,
  DashboardData,
  DashboardSettingsStats,
  DashboardTaskStats,
  DashboardUserStats,
  EmailAuthConfigState,
  MimoConfig,
} from "@/lib/types"

const emptyBilling: BillingConfig = {
  enabled: false,
  provider: "linuxdo_credit",
  provider_name: "LinuxDo Credit",
  configured: false,
  credit_multiplier: 1,
  plans: [],
}

const emptyMimo: MimoConfig = {
  base_url: "",
  configured: false,
}

const emptyEmail: EmailAuthConfigState = {
  enabled: false,
  verification_required: false,
  smtp: {},
  sender: {},
}

const emptyTaskStats: DashboardTaskStats = {
  total: 0,
  queued: 0,
  running: 0,
  completed: 0,
  failed: 0,
  modules: {},
}

const emptyUserStats: DashboardUserStats = {
  total: 0,
  active: 0,
  suspended: 0,
  deleted: 0,
  verified: 0,
  linuxdo_linked: 0,
  linuxDoLinked: 0,
}

const emptySettingsStats: DashboardSettingsStats = {
  total: 0,
}

const moduleLabels: Record<AudioModule, string> = {
  "speech-recognition": "语音识别",
  "speech-synthesis": "语音合成",
  "voice-design": "音色设计",
  "voice-clone": "声音克隆",
}

function formatEndpoint(value?: string | null) {
  if (!value) {
    return "未设置"
  }

  try {
    return new URL(value).host
  } catch {
    return value
  }
}

export default function DashboardPage() {
  const user = useCurrentUser()
  const [tasks, setTasks] = useState<AudioTask[]>([])
  const [taskStats, setTaskStats] =
    useState<DashboardTaskStats>(emptyTaskStats)
  const [userStats, setUserStats] =
    useState<DashboardUserStats>(emptyUserStats)
  const [billing, setBilling] = useState<BillingConfig>(emptyBilling)
  const [mimo, setMimo] = useState<MimoConfig>(emptyMimo)
  const [email, setEmail] = useState<EmailAuthConfigState>(emptyEmail)
  const [settingsStats, setSettingsStats] =
    useState<DashboardSettingsStats>(emptySettingsStats)
  const [loading, setLoading] = useState(false)
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const userId = user?.id
  const userRole = user?.role
  const isAdmin = userRole === "admin"

  function applyDashboardData(data: DashboardData) {
    setTasks(data.tasks.items)
    setTaskStats(data.tasks.stats)
    setBilling(data.billing)
    setUserStats(data.users ?? emptyUserStats)
    setMimo(data.mimo ?? emptyMimo)
    setEmail(data.email ?? emptyEmail)
    setSettingsStats(data.settings ?? emptySettingsStats)
    setUpdatedAt(
      data.updatedAt ??
        data.updated_at ??
        formatChinaDateTime(new Date())
    )
  }

  async function loadDashboard(showErrorToast = false) {
    setLoading(true)

    try {
      applyDashboardData(await api.dashboard())
    } catch (error) {
      if (showErrorToast) {
        toast.error(error instanceof Error ? error.message : "仪表盘加载失败")
      }
    } finally {
      setLoading(false)
    }
  }

  async function deleteTask(task: AudioTask) {
    setDeletingTaskId(task.id)

    try {
      if (isAdmin) {
        await api.deleteAdminTask(task.id)
      } else {
        await api.deleteTask(task.id)
      }

      setTasks((current) => current.filter((item) => item.id !== task.id))
      void loadDashboard(false)
      toast.success("任务已删除")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "任务删除失败")
    } finally {
      setDeletingTaskId(null)
    }
  }

  useEffect(() => {
    if (!userId) {
      return
    }

    let mounted = true

    async function syncDashboard() {
      try {
        const data = await api.dashboard()
        if (!mounted) {
          return
        }
        applyDashboardData(data)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "仪表盘加载失败")
      }
    }

    void syncDashboard()

    return () => {
      mounted = false
    }
  }, [userId, userRole])

  const totalTasks = taskStats.total
  const runningCount = taskStats.running
  const queuedCount = taskStats.queued
  const completedCount = taskStats.completed
  const failedCount = taskStats.failed
  const finishedCount = completedCount + failedCount
  const successRate =
    finishedCount > 0 ? Math.round((completedCount / finishedCount) * 100) : 0
  const enabledPlans = billing.plans.filter((plan) => plan.enabled)
  const defaultPlan =
    billing.plans.find((plan) => plan.id === billing.default_plan_id) ?? null
  const activeUsers = userStats.active
  const suspendedUsers = userStats.suspended
  const deletedUsers = userStats.deleted ?? 0
  const verifiedUsers = userStats.verified
  const linuxDoLinkedUsers =
    userStats.linuxDoLinked ?? userStats.linuxdo_linked
  const pendingCount = runningCount + queuedCount
  const billingStatus = billing.enabled
    ? billing.configured
      ? "可用"
      : "待配置"
    : "未启用"
  const smtpConfigured = Boolean(
    email.smtp_configured ||
      email.smtp?.host ||
      email.smtp?.username ||
      email.smtp?.password_configured
  )
  const systemBillingStatus = billing.enabled
    ? billing.configured
      ? "可用"
      : "待配置"
    : "停用"

  const moduleSummary = Object.entries(moduleLabels).map(([module, label]) => {
    const count = taskStats.modules[module] ?? 0
    const share = totalTasks > 0 ? Math.round((count / totalTasks) * 100) : 0

    return {
      module,
      label,
      count,
      share,
    }
  })

  const overviewMetrics = [
    {
      label: "总任务",
      value: totalTasks,
      meta: `${completedCount} 已完成`,
      tone: "default" as const,
      icon: <IconWaveSine className="size-4" />,
    },
    {
      label: "待处理",
      value: pendingCount,
      meta: `${runningCount} 运行中`,
      tone: "warning" as const,
      icon: <IconClockHour4 className="size-4" />,
    },
    {
      label: "成功率",
      value: `${successRate}%`,
      meta: `${failedCount} 失败`,
      tone: "success" as const,
      icon: <IconCheck className="size-4" />,
    },
    {
      label: isAdmin ? "活跃用户" : "可用套餐",
      value: isAdmin ? activeUsers : enabledPlans.length,
      meta: isAdmin
        ? `${suspendedUsers} 已暂停`
        : billing.enabled
          ? "套餐可购买"
          : "计费未启用",
      tone: "default" as const,
      icon: isAdmin ? (
        <IconUsers className="size-4" />
      ) : (
        <IconCreditCard className="size-4" />
      ),
    },
  ]

  return (
    <>
      <PageHeading
        title="仪表盘"
        actions={
          <Button
            variant="outline"
            onClick={() => void loadDashboard(true)}
            disabled={loading}
          >
            <IconRefresh data-icon="inline-start" />
            刷新
          </Button>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.42fr)_360px]">
        <Card className="relative overflow-hidden border border-border/70 bg-[linear-gradient(135deg,rgba(13,87,79,0.06),rgba(255,255,255,0.92)_52%,rgba(223,196,93,0.12))] shadow-sm dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(124,216,194,0.12),rgba(21,38,42,0.96)_50%,rgba(184,148,50,0.10))] dark:shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(13,87,79,0.12),transparent_28%),linear-gradient(rgba(255,255,255,0.56),rgba(255,255,255,0.56))] dark:bg-[radial-gradient(circle_at_top_right,rgba(124,216,194,0.18),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(223,196,93,0.11),transparent_34%),linear-gradient(rgba(6,18,21,0.34),rgba(6,18,21,0.34))]" />
          <CardContent className="relative space-y-4 px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {isAdmin ? "管理员视图" : "个人视图"}
              </Badge>
              <Badge variant="outline">
                {updatedAt ? `已更新 ${updatedAt}` : "首次加载"}
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {overviewMetrics.map((metric) => (
                <MetricCard
                  key={metric.label}
                  icon={metric.icon}
                  label={metric.label}
                  value={metric.value}
                  meta={metric.meta}
                  tone={metric.tone}
                />
              ))}
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <QuickLinkTile
                href="/workbench"
                title="任务处理"
                value={`${totalTasks} 条记录`}
              />
              <QuickLinkTile
                href="/billing"
                title="套餐计费"
                value={billing.enabled ? "已启用" : "未启用"}
              />
              <QuickLinkTile
                href={isAdmin ? "/users" : "/settings"}
                title={isAdmin ? "用户管理" : "个人设置"}
                value={isAdmin ? `${userStats.total} 个账户` : "接口与账户"}
              />
              <QuickLinkTile
                href={isAdmin ? "/system-settings" : "/tasks"}
                title={isAdmin ? "系统设置" : "任务记录"}
                value={
                  isAdmin
                    ? "站点与接入配置"
                    : `${pendingCount} 个待处理`
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>模块分布</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="font-medium">任务模块</span>
                <span className="text-xs text-muted-foreground">
                  {totalTasks} 条记录
                </span>
              </div>
              <div className="space-y-4">
                {moduleSummary.map((item) => (
                  <ModuleRow
                    key={item.module}
                    label={item.label}
                    count={item.count}
                    share={item.share}
                  />
                ))}
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-between">
            <span className="text-xs text-muted-foreground">
              {updatedAt ? `数据时间 ${updatedAt}` : "等待同步"}
            </span>
            <Button asChild variant="outline" size="sm">
              <Link href="/workbench">进入工作台</Link>
            </Button>
          </CardFooter>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.9fr)]">
        <div className="grid gap-4">
          <Card className="border-border/70">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle>近期任务</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/workbench">
                  查看全部
                  <IconArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>任务</TableHead>
                      <TableHead>模块</TableHead>
                      <TableHead>进度</TableHead>
                      <TableHead>状态</TableHead>
                      {isAdmin && <TableHead>用户</TableHead>}
                      <TableHead>时间</TableHead>
                      {isAdmin && <TableHead className="text-right">操作</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.slice(0, 8).map((task) => (
                      <TableRow key={task.id}>
                        <TableCell className="min-w-48">
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
                        <TableCell title={moduleLabels[task.module]}>
                          {moduleLabels[task.module]}
                        </TableCell>
                        <TableCell className="min-w-40">
                          <div className="flex items-center gap-3">
                            <Progress value={task.progress} className="h-1.5" />
                            <span className="w-10 text-xs text-muted-foreground">
                              {task.progress}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={task.status} />
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="min-w-40">
                            <div className="flex flex-col gap-1">
                              <span
                                className="max-w-36 truncate font-medium"
                                title={task.userName ?? task.userEmail ?? task.userId}
                              >
                                {task.userName ?? task.userEmail ?? "-"}
                              </span>
                              <span
                                className="max-w-40 truncate text-xs text-muted-foreground"
                                title={task.userEmail ?? task.userId ?? ""}
                              >
                                {task.userEmail ?? task.userId ?? ""}
                              </span>
                            </div>
                          </TableCell>
                        )}
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {task.createdAt}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  disabled={deletingTaskId === task.id}
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
                                    disabled={deletingTaskId === task.id}
                                  >
                                    {deletingTaskId === task.id ? (
                                      <IconRefresh data-icon="inline-start" />
                                    ) : (
                                      <IconTrash data-icon="inline-start" />
                                    )}
                                    确认删除
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {tasks.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={isAdmin ? 7 : 5}
                          className="py-8 text-center text-muted-foreground"
                        >
                          暂无任务记录
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

        </div>

        <div className="grid gap-4">
          {isAdmin ? (
            <>
              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle>用户状态</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <StatusLine
                    label="用户总数"
                    value={`${userStats.total}`}
                    icon={<IconUsers className="size-4" />}
                  />
                  <StatusLine
                    label="暂停用户"
                    value={`${suspendedUsers}`}
                    emphasis={suspendedUsers > 0 ? "negative" : "positive"}
                  />
                  <StatusLine
                    label="已注销"
                    value={`${deletedUsers}`}
                    emphasis={deletedUsers > 0 ? "negative" : "positive"}
                  />
                  <StatusLine
                    label="邮箱验证"
                    value={`${verifiedUsers}`}
                    icon={<IconMailCheck className="size-4" />}
                  />
                  <StatusLine
                    label="LinuxDo 绑定"
                    value={`${linuxDoLinkedUsers}`}
                    icon={<IconShieldCheck className="size-4" />}
                  />
                </CardContent>
              </Card>

              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle>系统概况</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <StatusLine
                    label="系统接口"
                    value={mimo.configured ? "已配置" : "未配置"}
                    icon={<IconApi className="size-4" />}
                  />
                  <StatusLine
                    label="SMTP"
                    value={smtpConfigured ? "已配置" : "待配置"}
                    icon={<IconServerCog className="size-4" />}
                  />
                  <StatusLine
                    label="邮箱登录"
                    value={email.enabled ? "启用" : "停用"}
                    icon={<IconMailCheck className="size-4" />}
                  />
                  <StatusLine
                    label="计费"
                    value={systemBillingStatus}
                    icon={<IconReceipt2 className="size-4" />}
                  />
                  <StatusLine
                    label="默认套餐"
                    value={defaultPlan?.name ?? "未设置"}
                    icon={<IconPackage className="size-4" />}
                  />
                  <StatusLine
                    label="积分倍率"
                    value={`${billing.credit_multiplier}x`}
                    icon={<IconPercentage className="size-4" />}
                  />
                  <StatusLine
                    label="接口域名"
                    value={formatEndpoint(mimo.base_url)}
                    icon={<IconWorldWww className="size-4" />}
                  />
                  <StatusLine
                    label="配置记录"
                    value={`${settingsStats.total} 项`}
                    icon={<IconHistory className="size-4" />}
                  />
                </CardContent>
                <CardFooter>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/system-settings">进入系统设置</Link>
                  </Button>
                </CardFooter>
              </Card>
            </>
          ) : (
            <>
              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle>账户状态</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <StatusLine label="账户名称" value={user?.name ?? "-"} />
                  <StatusLine
                    label="账户状态"
                    value={
                      user?.status === "deleted"
                        ? "已注销"
                        : user?.status === "suspended"
                          ? "已暂停"
                          : "正常"
                    }
                    emphasis={
                      user?.status === "suspended" || user?.status === "deleted"
                        ? "negative"
                        : "positive"
                    }
                  />
                  <StatusLine
                    label="登录方式"
                    value={user?.linuxdoId ? "LinuxDo Connect" : "邮箱"}
                  />
                  <StatusLine
                    label="邮箱验证"
                    value={user?.emailVerifiedAt ? "已完成" : "未验证"}
                    emphasis={user?.emailVerifiedAt ? "positive" : "neutral"}
                  />
                </CardContent>
              </Card>

              <Card className="border-border/70">
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <CardTitle>套餐计费</CardTitle>
                  <Badge
                    variant={billing.enabled ? "secondary" : "outline"}
                    className="shrink-0"
                  >
                    {billingStatus}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-xl border border-border/70 bg-muted/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex flex-col gap-1">
                        <span className="text-sm text-muted-foreground">
                          可用套餐
                        </span>
                        <span className="truncate text-lg font-semibold">
                          {enabledPlans.length} 个
                        </span>
                      </div>
                      <IconCreditCard className="mt-1 size-5 shrink-0 text-primary" />
                    </div>
                  </div>

                  {enabledPlans.slice(0, 3).map((plan) => (
                    <div
                      key={plan.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium" title={plan.name}>
                          {plan.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          配额 {plan.quota}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{plan.credit_amount}</div>
                        <div className="text-xs text-muted-foreground">
                          Credit
                        </div>
                      </div>
                    </div>
                  ))}
                  {enabledPlans.length > 3 && (
                    <div className="rounded-xl border border-dashed border-border/70 px-4 py-3 text-sm text-muted-foreground">
                      还有 {enabledPlans.length - 3} 个启用套餐
                    </div>
                  )}
                  {enabledPlans.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
                      暂无启用套餐
                    </div>
                  )}
                </CardContent>
                <CardFooter>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/billing">进入套餐计费</Link>
                  </Button>
                </CardFooter>
              </Card>
            </>
          )}
        </div>
      </section>
    </>
  )
}

function QuickLinkTile({
  href,
  title,
  value,
}: {
  href: string
  title: string
  value: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-white/75 px-4 py-4 shadow-sm transition hover:border-primary/35 hover:bg-white dark:border-white/10 dark:bg-white/[0.055] dark:shadow-none dark:hover:border-primary/35 dark:hover:bg-white/[0.085]"
    >
      <div className="min-w-0">
        <div className="font-medium" title={title}>
          {title}
        </div>
        <div className="text-sm text-muted-foreground" title={value}>
          {value}
        </div>
      </div>
      <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground dark:bg-primary/15 dark:group-hover:bg-primary dark:group-hover:text-primary-foreground">
        <IconArrowRight className="size-4" />
      </div>
    </Link>
  )
}

function MetricCard({
  icon,
  label,
  value,
  meta,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  meta: string
  tone: "default" | "success" | "warning"
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card px-4 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div
            className="mt-2 truncate text-3xl font-semibold tracking-normal"
            title={String(value)}
          >
            {value}
          </div>
        </div>
        <div
          className={cn(
            "flex size-10 items-center justify-center rounded-2xl",
            tone === "default" && "bg-primary/10 text-primary",
            tone === "success" && "bg-emerald-500/10 text-emerald-700",
            tone === "warning" && "bg-amber-500/12 text-amber-700"
          )}
        >
          {icon}
        </div>
      </div>
      <div className="mt-4 text-sm text-muted-foreground" title={meta}>
        {meta}
      </div>
    </div>
  )
}

function ModuleRow({
  label,
  count,
  share,
}: {
  label: string
  count: number
  share: number
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium" title={label}>
          {label}
        </div>
        <div className="text-sm text-muted-foreground">
          {count} / {share}%
        </div>
      </div>
      <Progress value={share} className="h-1.5" />
    </div>
  )
}

function StatusLine({
  label,
  value,
  emphasis = "neutral",
  icon,
}: {
  label: string
  value: string
  emphasis?: "neutral" | "positive" | "negative"
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {!icon && emphasis === "positive" && (
          <IconShieldCheck className="size-4" />
        )}
        {!icon && emphasis === "negative" && <IconX className="size-4" />}
        {!icon && emphasis === "neutral" && <IconBolt className="size-4" />}
        <span>{label}</span>
      </div>
      <div className="max-w-[58%] truncate text-sm font-medium" title={value}>
        {value}
      </div>
    </div>
  )
}
