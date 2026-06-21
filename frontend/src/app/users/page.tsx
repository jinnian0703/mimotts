"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  IconDeviceFloppy,
  IconLoader2,
  IconReceipt2,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconUsers,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/components/auth-gate"
import { PageHeading } from "@/components/page-heading"
import { TablePagination } from "@/components/table-pagination"
import { api } from "@/lib/api"
import type { BillingConfig, PaginationMeta, User, UserStatus } from "@/lib/types"
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
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
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

type UserDraft = {
  id: string
  name: string
  email: string
  role: "admin" | "user"
  status: UserStatus
  plan_id: string
}

type QuotaAdjustmentDraft = {
  user: User
  mode: "add" | "subtract" | "set"
  amount: number
  reason: string
}

type FilterValue = "all"
const defaultPageSize = 20
const defaultUserPagination: PaginationMeta = {
  page: 1,
  perPage: defaultPageSize,
  total: 0,
  pageCount: 1,
}

export default function UsersPage() {
  const router = useRouter()
  const currentUser = useCurrentUser()
  const [users, setUsers] = useState<User[]>([])
  const [billing, setBilling] = useState<BillingConfig | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [editing, setEditing] = useState<UserDraft | null>(null)
  const [removing, setRemoving] = useState<User | null>(null)
  const [quotaAdjusting, setQuotaAdjusting] =
    useState<QuotaAdjustmentDraft | null>(null)
  const [bulkPlanId, setBulkPlanId] = useState("")
  const [query, setQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<FilterValue | "admin" | "user">("all")
  const [statusFilter, setStatusFilter] =
    useState<FilterValue | UserStatus>("all")
  const [planFilter, setPlanFilter] = useState("all")
  const [emailFilter, setEmailFilter] =
    useState<FilterValue | "verified" | "unverified">("all")
  const [linuxDoFilter, setLinuxDoFilter] =
    useState<FilterValue | "linked" | "unlinked">("all")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [userPagination, setUserPagination] =
    useState<PaginationMeta>(defaultUserPagination)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const isAdmin = currentUser?.role === "admin"

  const planNameById = useMemo(
    () =>
      new Map(
        (billing?.plans ?? []).map((plan) => [
          plan.id,
          plan.name,
        ])
      ),
    [billing]
  )

  const statusLabels: Record<UserStatus, string> = {
    active: "启用",
    suspended: "暂停",
    deleted: "已注销",
  }

  function userStatus(user: User): UserStatus {
    return user.status ?? "active"
  }

  function canManageUser(user: User): boolean {
    return userStatus(user) !== "deleted"
  }

  const refreshUsers = useCallback(async (resetSelection = false) => {
    setLoading(true)

    try {
      const userPage = await api.userPage({
        page,
        pageSize,
        query,
        role: roleFilter,
        status: statusFilter,
        planId: planFilter,
        email: emailFilter,
        linuxDo: linuxDoFilter,
      })

      setUsers(userPage.users)
      setUserPagination(userPage.pagination)

      if (userPage.pagination.page !== page) {
        setPage(userPage.pagination.page)
      }

      if (resetSelection) {
        setSelectedIds([])
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "用户列表获取失败")
    } finally {
      setLoading(false)
    }
  }, [
    emailFilter,
    linuxDoFilter,
    page,
    pageSize,
    planFilter,
    query,
    roleFilter,
    statusFilter,
  ])

  const refreshBilling = useCallback(async () => {
    try {
      setBilling(await api.adminBillingConfig())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "套餐配置获取失败")
    }
  }, [])

  const refresh = useCallback(async () => {
    await Promise.all([refreshUsers(true), refreshBilling()])
  }, [refreshBilling, refreshUsers])

  useEffect(() => {
    if (currentUser && !isAdmin) {
      router.replace("/dashboard")
    }
  }, [currentUser, isAdmin, router])

  useEffect(() => {
    if (!isAdmin) {
      return
    }

    const timer = window.setTimeout(() => {
      void refreshBilling()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [isAdmin, refreshBilling])

  useEffect(() => {
    if (!isAdmin) {
      return
    }

    const timer = window.setTimeout(() => {
      void refreshUsers()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [
    emailFilter,
    isAdmin,
    linuxDoFilter,
    page,
    pageSize,
    planFilter,
    query,
    refreshUsers,
    roleFilter,
    statusFilter,
  ])

  const manageableVisibleIds = users.filter(canManageUser).map((user) => user.id)
  const selectedVisibleIds = manageableVisibleIds.filter((id) =>
    selectedIds.includes(id)
  )

  function toggleUser(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? [...new Set([...current, id])] : current.filter((item) => item !== id)
    )
  }

  function toggleAll(checked: boolean) {
    setSelectedIds((current) =>
      checked
        ? [...new Set([...current, ...manageableVisibleIds])]
        : current.filter((id) => !manageableVisibleIds.includes(id))
    )
  }

  function resetFilteredPage() {
    setPage(1)
    setSelectedIds([])
  }

  function openEdit(user: User) {
    setEditing({
      id: user.id,
      name: user.name,
      email: user.email ?? "",
      role: user.role,
      status: user.status ?? "active",
      plan_id: user.planId ?? "",
    })
  }

  function openQuotaAdjustment(user: User) {
    setQuotaAdjusting({
      user,
      mode: "add",
      amount: 0,
      reason: "",
    })
  }

  async function saveUser() {
    if (!editing) {
      return
    }
    setSaving(true)

    try {
      const saved = await api.updateUser(editing.id, {
        name: editing.name,
        email: editing.email || null,
        role: editing.role,
        status: editing.status,
        plan_id: editing.plan_id || null,
      })
      setUsers((current) =>
        current.map((user) => (user.id === saved.id ? saved : user))
      )
      setEditing(null)
      toast.success("用户已保存")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "用户保存失败")
    } finally {
      setSaving(false)
    }
  }

  async function removeDeletedUser() {
    if (!removing) {
      return
    }

    setSaving(true)

    try {
      const removedId = await api.removeDeletedUser(removing.id)
      setUsers((current) => current.filter((user) => user.id !== removedId))
      setSelectedIds((current) => current.filter((id) => id !== removedId))
      setUserPagination((current) => ({
        ...current,
        total: Math.max(0, current.total - 1),
      }))
      setRemoving(null)
      toast.success("已注销用户已移除")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "用户移除失败")
    } finally {
      setSaving(false)
    }
  }

  async function saveQuotaAdjustment() {
    if (!quotaAdjusting) {
      return
    }

    const amount = Math.max(0, Number(quotaAdjusting.amount || 0))
    if (!quotaAdjusting.reason.trim()) {
      toast.error("请填写调整原因")
      return
    }
    if (quotaAdjusting.mode !== "set" && amount <= 0) {
      toast.error("加减额度必须大于 0")
      return
    }

    setSaving(true)

    try {
      const result = await api.adjustUserQuota(quotaAdjusting.user.id, {
        mode: quotaAdjusting.mode,
        amount,
        reason: quotaAdjusting.reason.trim(),
      })
      setUsers((current) =>
        current.map((user) => (user.id === result.user.id ? result.user : user))
      )
      setQuotaAdjusting(null)
      toast.success("额度已调整")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "额度调整失败")
    } finally {
      setSaving(false)
    }
  }

  async function bulk(action: "activate" | "suspend" | "set_plan") {
    if (selectedIds.length === 0) {
      toast.error("请选择用户")
      return
    }
    if (action === "set_plan" && !bulkPlanId) {
      toast.error("请选择套餐")
      return
    }
    setSaving(true)

    try {
      await api.bulkUsers({
        ids: selectedIds,
        action,
        plan_id: action === "set_plan" ? bulkPlanId : undefined,
      })
      await refreshUsers(true)
      toast.success(action === "set_plan" ? "套餐额度已增加" : "批量操作已完成")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量操作失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeading
        title="用户管理"
        actions={
          <Button variant="outline" onClick={refresh} disabled={loading}>
            <IconRefresh data-icon="inline-start" />
            刷新
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle>用户列表</CardTitle>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{userPagination.total} 个匹配</Badge>
                  <Badge variant="outline">{users.length} 个当前页</Badge>
                  <Badge variant="outline">{selectedIds.length} 个已选</Badge>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => bulk("activate")}
                  disabled={saving || selectedIds.length === 0}
                >
                  启用
                </Button>
                <Button
                  variant="outline"
                  onClick={() => bulk("suspend")}
                  disabled={saving || selectedIds.length === 0}
                >
                  暂停
                </Button>
                <Select value={bulkPlanId} onValueChange={setBulkPlanId}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="套餐" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(billing?.plans ?? []).map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => bulk("set_plan")}
                  disabled={saving || selectedIds.length === 0}
                >
                  分配套餐额度
                </Button>
              </div>
            </div>
            <div className="grid gap-2 xl:grid-cols-[minmax(220px,1fr)_120px_120px_150px_130px_140px]">
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    resetFilteredPage()
                  }}
                  placeholder="搜索名称、邮箱、套餐、LinuxDo"
                  className="pl-8"
                />
              </div>
              <Select
                value={roleFilter}
                onValueChange={(value) => {
                  setRoleFilter(value as FilterValue | "admin" | "user")
                  resetFilteredPage()
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="角色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">全部角色</SelectItem>
                    <SelectItem value="admin">管理员</SelectItem>
                    <SelectItem value="user">用户</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as FilterValue | UserStatus)
                  resetFilteredPage()
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">全部状态</SelectItem>
                    <SelectItem value="active">启用</SelectItem>
                    <SelectItem value="suspended">暂停</SelectItem>
                    <SelectItem value="deleted">已注销</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                value={planFilter}
                onValueChange={(value) => {
                  setPlanFilter(value)
                  resetFilteredPage()
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="套餐" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">全部套餐</SelectItem>
                    <SelectItem value="__none">无套餐</SelectItem>
                    {(billing?.plans ?? []).map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                value={emailFilter}
                onValueChange={(value) => {
                  setEmailFilter(value as FilterValue | "verified" | "unverified")
                  resetFilteredPage()
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="邮箱" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">全部邮箱</SelectItem>
                    <SelectItem value="verified">已验证</SelectItem>
                    <SelectItem value="unverified">未验证</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                value={linuxDoFilter}
                onValueChange={(value) => {
                  setLinuxDoFilter(value as FilterValue | "linked" | "unlinked")
                  resetFilteredPage()
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="LinuxDo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">全部绑定</SelectItem>
                    <SelectItem value="linked">已绑定</SelectItem>
                    <SelectItem value="unlinked">未绑定</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {userPagination.total === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconUsers />
                </EmptyMedia>
                <EmptyTitle>暂无用户</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Checkbox
                        checked={
                          manageableVisibleIds.length > 0 &&
                          selectedVisibleIds.length === manageableVisibleIds.length
                        }
                        onCheckedChange={(checked) => toggleAll(Boolean(checked))}
                      />
                    </TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead>邮箱</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>套餐</TableHead>
                    <TableHead>额度</TableHead>
                    <TableHead>邮箱验证</TableHead>
                    <TableHead>LinuxDo</TableHead>
                    <TableHead>最近登录</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const status = userStatus(user)
                    const manageable = canManageUser(user)

                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.includes(user.id)}
                            disabled={!manageable}
                            onCheckedChange={(checked) =>
                              toggleUser(user.id, Boolean(checked))
                            }
                          />
                        </TableCell>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell>{user.email ?? "-"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {user.role === "admin" ? "管理员" : "用户"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              status === "suspended"
                                ? "destructive"
                                : status === "deleted"
                                  ? "outline"
                                  : "secondary"
                            }
                          >
                            {statusLabels[status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {user.planId ? planNameById.get(user.planId) ?? user.planId : "-"}
                        </TableCell>
                        <TableCell>{user.quotaBalance ?? 0}</TableCell>
                        <TableCell>{user.emailVerifiedAt ? "已验证" : "未验证"}</TableCell>
                        <TableCell>{user.linuxdoId ? "已绑定" : "未绑定"}</TableCell>
                        <TableCell>{user.lastLoginAt ?? "-"}</TableCell>
                        <TableCell className="text-right">
                          {status === "deleted" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRemoving(user)}
                            >
                              <IconTrash data-icon="inline-start" />
                              移除
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openQuotaAdjustment(user)}
                                disabled={!manageable}
                              >
                                额度
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEdit(user)}
                                disabled={!manageable}
                              >
                                编辑
                              </Button>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {userPagination.total > 0 && (
            <div className="mt-4">
              <TablePagination
                total={userPagination.total}
                page={userPagination.page}
                pageSize={userPagination.perPage}
                onPageChange={setPage}
                onPageSizeChange={(nextPageSize) => {
                  setPageSize(nextPageSize)
                  setPage(1)
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑用户</DialogTitle>
          </DialogHeader>
          {editing && (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="edit-name">名称</FieldLabel>
                <Input
                  id="edit-name"
                  value={editing.name}
                  onChange={(event) =>
                    setEditing((current) =>
                      current ? { ...current, name: event.target.value } : current
                    )
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-email">邮箱</FieldLabel>
                <Input
                  id="edit-email"
                  type="email"
                  value={editing.email}
                  onChange={(event) =>
                    setEditing((current) =>
                      current ? { ...current, email: event.target.value } : current
                    )
                  }
                />
              </Field>
              <FieldGroup className="grid gap-5 md:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="edit-role">角色</FieldLabel>
                  <Select
                    value={editing.role}
                    onValueChange={(role) =>
                      setEditing((current) =>
                        current
                          ? { ...current, role: role as "admin" | "user" }
                          : current
                      )
                    }
                  >
                    <SelectTrigger id="edit-role" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="user">用户</SelectItem>
                        <SelectItem value="admin">管理员</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-status">状态</FieldLabel>
                  <Select
                    value={editing.status}
                    onValueChange={(status) =>
                      setEditing((current) =>
                        current
                          ? {
                              ...current,
                              status: status as UserStatus,
                            }
                          : current
                      )
                    }
                  >
                    <SelectTrigger id="edit-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="active">启用</SelectItem>
                        <SelectItem value="suspended">暂停</SelectItem>
                        <SelectItem value="deleted">已注销</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="edit-plan">套餐</FieldLabel>
                  <Select
                    value={editing.plan_id || "__none"}
                    onValueChange={(plan_id) =>
                      setEditing((current) =>
                        current
                          ? {
                              ...current,
                              plan_id: plan_id === "__none" ? "" : plan_id,
                            }
                          : current
                      )
                    }
                  >
                    <SelectTrigger id="edit-plan" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="__none">无</SelectItem>
                        {(billing?.plans ?? []).map((plan) => (
                          <SelectItem key={plan.id} value={plan.id}>
                            {plan.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
            </FieldGroup>
          )}
          <DialogFooter>
            <Button onClick={saveUser} disabled={saving}>
              {saving ? (
                <IconLoader2 data-icon="inline-start" />
              ) : (
                <IconDeviceFloppy data-icon="inline-start" />
              )}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>移除已注销用户</DialogTitle>
            <DialogDescription>
              移除后该用户将从用户管理中删除，不能恢复。
            </DialogDescription>
          </DialogHeader>
          {removing && (
            <div className="rounded-xl border border-border/70 px-4 py-3">
              <div className="text-sm text-muted-foreground">已注销账号</div>
              <div className="mt-1 font-medium">{removing.name}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {removing.email ?? "未绑定邮箱"}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)} disabled={saving}>
              取消
            </Button>
            <Button variant="destructive" onClick={removeDeletedUser} disabled={saving}>
              {saving ? (
                <IconLoader2 data-icon="inline-start" />
              ) : (
                <IconTrash data-icon="inline-start" />
              )}
              确认移除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!quotaAdjusting}
        onOpenChange={(open) => !open && setQuotaAdjusting(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>调整额度</DialogTitle>
          </DialogHeader>
          {quotaAdjusting && (
            <FieldGroup>
              <div className="rounded-xl border border-border/70 px-4 py-3">
                <div className="text-sm text-muted-foreground">
                  {quotaAdjusting.user.name}
                </div>
                <div className="mt-1 text-xl font-semibold">
                  当前额度 {quotaAdjusting.user.quotaBalance ?? 0}
                </div>
              </div>
              <Field>
                <FieldLabel htmlFor="quota-mode">方式</FieldLabel>
                <Select
                  value={quotaAdjusting.mode}
                  onValueChange={(mode) =>
                    setQuotaAdjusting((current) =>
                      current
                        ? {
                            ...current,
                            mode: mode as "add" | "subtract" | "set",
                          }
                        : current
                    )
                  }
                >
                  <SelectTrigger id="quota-mode" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="add">增加额度</SelectItem>
                      <SelectItem value="subtract">扣减额度</SelectItem>
                      <SelectItem value="set">设为余额</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="quota-amount">额度数值</FieldLabel>
                <Input
                  id="quota-amount"
                  type="number"
                  min="0"
                  step="1"
                  value={quotaAdjusting.amount}
                  onChange={(event) =>
                    setQuotaAdjusting((current) =>
                      current
                        ? {
                            ...current,
                            amount: Math.max(
                              0,
                              Number(event.target.value || 0)
                            ),
                          }
                        : current
                    )
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="quota-reason">原因</FieldLabel>
                <Input
                  id="quota-reason"
                  value={quotaAdjusting.reason}
                  onChange={(event) =>
                    setQuotaAdjusting((current) =>
                      current
                        ? { ...current, reason: event.target.value }
                        : current
                    )
                  }
                  placeholder="例如：线下补偿、测试扣减、活动赠送"
                />
              </Field>
            </FieldGroup>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuotaAdjusting(null)}>
              取消
            </Button>
            <Button onClick={saveQuotaAdjustment} disabled={saving}>
              {saving ? (
                <IconLoader2 data-icon="inline-start" />
              ) : (
                <IconReceipt2 data-icon="inline-start" />
              )}
              记录调整
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
