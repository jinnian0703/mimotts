"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  IconDeviceFloppy,
  IconLoader2,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { FieldHelpLabel } from "@/components/field-help-label"
import { useCurrentUser } from "@/components/auth-gate"
import { PageHeading } from "@/components/page-heading"
import { api } from "@/lib/api"
import {
  formatChinaDateTime,
  parseChinaTimestamp,
  toChinaDateTimeLocalValue,
} from "@/lib/china-time"
import type {
  Announcement,
  AnnouncementAudience,
  AnnouncementLevel,
} from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldGroup,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

type AnnouncementDraft = {
  title: string
  content: string
  level: AnnouncementLevel
  audience: AnnouncementAudience
  active: boolean
  show_popup: boolean
  starts_at: string
  ends_at: string
}

const levelLabels: Record<AnnouncementLevel, string> = {
  info: "信息",
  success: "成功",
  warning: "提醒",
  destructive: "紧急",
}

const audienceLabels: Record<AnnouncementAudience, string> = {
  all: "全部用户",
  admin: "仅管理员",
  user: "仅普通用户",
}

const emptyDraft: AnnouncementDraft = {
  title: "",
  content: "",
  level: "info",
  audience: "all",
  active: true,
  show_popup: true,
  starts_at: "",
  ends_at: "",
}

function toDateTimeLocalValue(value?: string | null) {
  return toChinaDateTimeLocalValue(value)
}

function formatDateTime(value?: string | null) {
  return formatChinaDateTime(value)
}

function statusLabel(announcement: Announcement) {
  const now = Date.now()
  const startsAt = announcement.startsAt
    ? parseChinaTimestamp(announcement.startsAt)
    : null
  const endsAt = announcement.endsAt
    ? parseChinaTimestamp(announcement.endsAt)
    : null

  if (!announcement.active) {
    return "停用"
  }
  if (startsAt && startsAt > now) {
    return "未开始"
  }
  if (endsAt && endsAt < now) {
    return "已结束"
  }

  return "发布中"
}

export default function AnnouncementsPage() {
  const router = useRouter()
  const user = useCurrentUser()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [draft, setDraft] = useState<AnnouncementDraft>(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const isAdmin = user?.role === "admin"

  useEffect(() => {
    if (user && !isAdmin) {
      router.replace("/dashboard")
    }
  }, [user, isAdmin, router])

  useEffect(() => {
    if (isAdmin) {
      void refresh()
    }
  }, [isAdmin])

  async function refresh() {
    setLoading(true)

    try {
      setAnnouncements(await api.adminAnnouncements())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "公告列表获取失败")
    } finally {
      setLoading(false)
    }
  }

  function resetDraft() {
    setEditingId(null)
    setDraft(emptyDraft)
  }

  function openCreateDialog() {
    resetDraft()
    setDialogOpen(true)
  }

  function openEditDialog(announcement: Announcement) {
    setEditingId(announcement.id)
    setDraft({
      title: announcement.title,
      content: announcement.content,
      level: announcement.level,
      audience: announcement.audience,
      active: announcement.active,
      show_popup: announcement.showPopup !== false,
      starts_at: toDateTimeLocalValue(announcement.startsAt),
      ends_at: toDateTimeLocalValue(announcement.endsAt),
    })
    setDialogOpen(true)
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open)
    if (!open && !saving) {
      resetDraft()
    }
  }

  async function saveAnnouncement() {
    if (!draft.title.trim() || !draft.content.trim()) {
      toast.error("请填写标题和内容")
      return
    }

    setSaving(true)

    try {
      const payload = {
        title: draft.title.trim(),
        content: draft.content.trim(),
        level: draft.level,
        audience: draft.audience,
        active: draft.active,
        show_popup: draft.show_popup,
        starts_at: draft.starts_at || null,
        ends_at: draft.ends_at || null,
      }

      if (editingId) {
        await api.updateAdminAnnouncement(editingId, payload)
        toast.success("公告已更新")
      } else {
        await api.createAdminAnnouncement(payload)
        toast.success("公告已发布")
      }

      setDialogOpen(false)
      resetDraft()
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "公告保存失败")
    } finally {
      setSaving(false)
    }
  }

  async function deleteAnnouncement(id: string) {
    if (!confirm("确认删除该公告？")) {
      return
    }

    setDeletingId(id)

    try {
      await api.deleteAdminAnnouncement(id)
      setAnnouncements((current) => current.filter((item) => item.id !== id))
      toast.success("公告已删除")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "公告删除失败")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <PageHeading
        title="公告管理"
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={openCreateDialog}>
              <IconPlus data-icon="inline-start" />
              新建
            </Button>
            <Button
              variant="outline"
              onClick={() => void refresh()}
              disabled={loading}
            >
              {loading ? (
                <IconLoader2 data-icon="inline-start" />
              ) : (
                <IconRefresh data-icon="inline-start" />
              )}
              刷新
            </Button>
          </div>
        }
      />

      <Card className="border-border/70">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>公告列表</CardTitle>
            <Badge variant="outline">{announcements.length} 条</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>标题</TableHead>
                  <TableHead>等级</TableHead>
                  <TableHead>范围</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>弹窗</TableHead>
                  <TableHead>时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {announcements.map((announcement) => {
                  const currentStatus = statusLabel(announcement)

                  return (
                    <TableRow key={announcement.id}>
                      <TableCell className="min-w-80">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">
                            {announcement.title}
                          </span>
                          <span
                            className="line-clamp-2 max-w-2xl text-xs text-muted-foreground"
                            title={announcement.content}
                          >
                            {announcement.content}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {levelLabels[announcement.level]}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {audienceLabels[announcement.audience]}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            currentStatus === "发布中"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {currentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            announcement.showPopup === false
                              ? "outline"
                              : "secondary"
                          }
                        >
                          {announcement.showPopup === false ? "不弹窗" : "弹窗"}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-48 text-xs text-muted-foreground">
                        <div>{formatDateTime(announcement.startsAt)}</div>
                        <div>{formatDateTime(announcement.endsAt)}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEditDialog(announcement)}
                          >
                            <IconPencil />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={deletingId === announcement.id}
                            onClick={() =>
                              void deleteAnnouncement(announcement.id)
                            }
                          >
                            <IconTrash />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {announcements.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-16 text-center text-muted-foreground"
                    >
                      暂无公告
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3 pr-8">
              <DialogTitle>{editingId ? "编辑公告" : "发布公告"}</DialogTitle>
              <Badge variant={draft.active ? "secondary" : "outline"}>
                {draft.active ? "启用" : "停用"}
              </Badge>
            </div>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldHelpLabel
                htmlFor="announcement-title"
                requirement="required"
                help="公告主标题，建议控制在 20 个字以内。"
              >
                标题
              </FieldHelpLabel>
              <Input
                id="announcement-title"
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </Field>

            <Field>
              <FieldHelpLabel
                htmlFor="announcement-content"
                requirement="required"
                help="公告正文会显示在用户页面顶部。"
              >
                内容
              </FieldHelpLabel>
              <Textarea
                id="announcement-content"
                rows={6}
                value={draft.content}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    content: event.target.value,
                  }))
                }
              />
            </Field>

            <div className="grid gap-5 md:grid-cols-2">
              <Field>
                <FieldHelpLabel
                  htmlFor="announcement-level"
                  requirement="required"
                  help="不同等级会影响前台公告配色。"
                >
                  等级
                </FieldHelpLabel>
                <Select
                  value={draft.level}
                  onValueChange={(level) =>
                    setDraft((current) => ({
                      ...current,
                      level: level as AnnouncementLevel,
                    }))
                  }
                >
                  <SelectTrigger id="announcement-level" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(levelLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldHelpLabel
                  htmlFor="announcement-audience"
                  requirement="required"
                  help="控制公告对哪些账号可见。"
                >
                  可见范围
                </FieldHelpLabel>
                <Select
                  value={draft.audience}
                  onValueChange={(audience) =>
                    setDraft((current) => ({
                      ...current,
                      audience: audience as AnnouncementAudience,
                    }))
                  }
                >
                  <SelectTrigger id="announcement-audience" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(audienceLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Field>
                <FieldHelpLabel
                  htmlFor="announcement-start"
                  requirement="optional"
                  help="为空时立即生效。"
                >
                  开始时间
                </FieldHelpLabel>
                <Input
                  id="announcement-start"
                  type="datetime-local"
                  value={draft.starts_at}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      starts_at: event.target.value,
                    }))
                  }
                />
              </Field>

              <Field>
                <FieldHelpLabel
                  htmlFor="announcement-end"
                  requirement="optional"
                  help="为空时持续显示，直到手动停用。"
                >
                  结束时间
                </FieldHelpLabel>
                <Input
                  id="announcement-end"
                  type="datetime-local"
                  value={draft.ends_at}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      ends_at: event.target.value,
                    }))
                  }
                />
              </Field>
            </div>

            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>启用状态</FieldTitle>
              </FieldContent>
              <Switch
                checked={draft.active}
                onCheckedChange={(active) =>
                  setDraft((current) => ({
                    ...current,
                    active,
                  }))
                }
              />
            </Field>

            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>弹窗提醒</FieldTitle>
              </FieldContent>
              <Switch
                checked={draft.show_popup}
                onCheckedChange={(show_popup) =>
                  setDraft((current) => ({
                    ...current,
                    show_popup,
                  }))
                }
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleDialogOpenChange(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button onClick={() => void saveAnnouncement()} disabled={saving}>
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
