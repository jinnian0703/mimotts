"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  IconDeviceFloppy,
  IconLoader2,
  IconRefresh,
  IconUsers,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/components/auth-gate"
import { PageHeading } from "@/components/page-heading"
import { api } from "@/lib/api"
import type { BillingConfig, User } from "@/lib/types"
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
  status: "active" | "suspended"
  plan_id: string
  quota_balance: number
}

export default function UsersPage() {
  const router = useRouter()
  const currentUser = useCurrentUser()
  const [users, setUsers] = useState<User[]>([])
  const [billing, setBilling] = useState<BillingConfig | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [editing, setEditing] = useState<UserDraft | null>(null)
  const [bulkPlanId, setBulkPlanId] = useState("")
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

  useEffect(() => {
    if (currentUser && !isAdmin) {
      router.replace("/dashboard")
    }
  }, [currentUser, isAdmin, router])

  useEffect(() => {
    if (isAdmin) {
      refresh()
    }
  }, [isAdmin])

  async function refresh() {
    setLoading(true)

    try {
      const [nextUsers, nextBilling] = await Promise.all([
        api.users(),
        api.adminBillingConfig(),
      ])
      setUsers(nextUsers)
      setBilling(nextBilling)
      setSelectedIds([])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "用户列表获取失败")
    } finally {
      setLoading(false)
    }
  }

  function toggleUser(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? [...new Set([...current, id])] : current.filter((item) => item !== id)
    )
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? users.map((user) => user.id) : [])
  }

  function openEdit(user: User) {
    setEditing({
      id: user.id,
      name: user.name,
      email: user.email ?? "",
      role: user.role,
      status: user.status ?? "active",
      plan_id: user.planId ?? "",
      quota_balance: user.quotaBalance ?? 0,
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
        quota_balance: Math.max(0, Number(editing.quota_balance || 0)),
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
      const nextUsers = await api.bulkUsers({
        ids: selectedIds,
        action,
        plan_id: action === "set_plan" ? bulkPlanId : undefined,
      })
      setUsers(nextUsers)
      setSelectedIds([])
      toast.success("批量操作已完成")
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
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>用户列表</CardTitle>
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
                分配套餐
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconUsers />
                </EmptyMedia>
                <EmptyTitle>暂无用户</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Checkbox
                      checked={
                        users.length > 0 && selectedIds.length === users.length
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
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(user.id)}
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
                          user.status === "suspended"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {user.status === "suspended" ? "暂停" : "启用"}
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(user)}
                      >
                        编辑
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
                              status: status as "active" | "suspended",
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
              <Field>
                <FieldLabel htmlFor="edit-quota-balance">额度</FieldLabel>
                <Input
                  id="edit-quota-balance"
                  type="number"
                  min="0"
                  step="1"
                  value={editing.quota_balance}
                  onChange={(event) =>
                    setEditing((current) =>
                      current
                        ? {
                            ...current,
                            quota_balance: Math.max(
                              0,
                              Number(event.target.value || 0)
                            ),
                          }
                        : current
                    )
                  }
                />
              </Field>
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
    </>
  )
}
