"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  IconDeviceFloppy,
  IconLoader2,
  IconMail,
  IconShieldCheck,
  IconTrash,
  IconUnlink,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { useCurrentUser } from "@/components/auth-gate"
import { PageHeading } from "@/components/page-heading"
import { api } from "@/lib/api"
import { clearSession, setSession } from "@/lib/session"
import type { MimoConfig, User } from "@/lib/types"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
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
} from "@/components/ui/dialog"
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"

const defaultConfig: MimoConfig = {
  base_url: "https://api.xiaomimimo.com/v1",
  api_key: "",
  enabled: false,
  configured: false,
}

type SettingsDialog =
  | "profile"
  | "email"
  | "password"
  | "two-factor"
  | "linuxdo-unlink"
  | "delete"
  | "mimo"
  | null

export default function SettingsPage() {
  const router = useRouter()
  const user = useCurrentUser()
  const [accountUser, setAccountUser] = useState<User | null>(null)
  const [config, setConfig] = useState<MimoConfig>(defaultConfig)
  const [linuxDoAvailable, setLinuxDoAvailable] = useState(false)
  const [dialog, setDialog] = useState<SettingsDialog>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [profileName, setProfileName] = useState("")
  const [email, setEmail] = useState("")
  const [emailPassword, setEmailPassword] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [twoFactorPassword, setTwoFactorPassword] = useState("")
  const [twoFactorCode, setTwoFactorCode] = useState("")
  const [twoFactorSent, setTwoFactorSent] = useState(false)
  const [linuxDoPassword, setLinuxDoPassword] = useState("")
  const [deletePassword, setDeletePassword] = useState("")
  const [deleteConfirmation, setDeleteConfirmation] = useState("")

  useEffect(() => {
    api
      .userMimoConfig()
      .then((value) => setConfig({ ...defaultConfig, ...value, api_key: "" }))
      .catch(() => undefined)

    api
      .installStatus()
      .then((status) => setLinuxDoAvailable(status.linuxDoLoginEnabled === true))
      .catch(() => setLinuxDoAvailable(false))

    const params = new URLSearchParams(window.location.search)
    const linuxDoBind = params.get("linuxdo_bind")
    if (linuxDoBind) {
      params.delete("linuxdo_bind")
      const nextQuery = params.toString()
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`
      )

      const toastKey = `mimotts:linuxdo_bind:${linuxDoBind}`
      const shouldNotify = sessionStorage.getItem(toastKey) !== "shown"
      sessionStorage.setItem(toastKey, "shown")

      if (linuxDoBind === "success") {
        if (shouldNotify) {
          toast.success("LinuxDo 已绑定")
        }
        api
          .me()
          .then((nextUser) => {
            setAccountUser(nextUser)
            setSession(nextUser)
          })
          .catch(() => undefined)
      } else if (linuxDoBind === "conflict") {
        if (shouldNotify) {
          toast.error("该 LinuxDo 账号已绑定其他用户")
        }
      } else if (shouldNotify) {
        toast.error("LinuxDo 绑定会话已失效")
      }
    }
  }, [router])

  function syncUser(nextUser: User) {
    setAccountUser(nextUser)
    setSession(nextUser)
  }

  function closeDialog() {
    setDialog(null)
  }

  function openProfileDialog() {
    setProfileName(currentUser?.name ?? "")
    setDialog("profile")
  }

  function openEmailDialog() {
    setEmail(currentUser?.email ?? "")
    setEmailPassword("")
    setDialog("email")
  }

  function openPasswordDialog() {
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setDialog("password")
  }

  function openTwoFactorDialog() {
    setTwoFactorPassword("")
    setTwoFactorCode("")
    setTwoFactorSent(false)
    setDialog("two-factor")
  }

  function openLinuxDoUnlinkDialog() {
    setLinuxDoPassword("")
    setDialog("linuxdo-unlink")
  }

  function openDeleteDialog() {
    setDeletePassword("")
    setDeleteConfirmation("")
    setDialog("delete")
  }

  async function save() {
    setSaving("mimo")

    try {
      const saved = await api.saveUserMimoConfig(config)
      setConfig((current) => ({ ...current, ...saved, api_key: "" }))
      toast.success("设置已保存")
      closeDialog()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "设置保存失败")
    } finally {
      setSaving(null)
    }
  }

  async function saveProfile() {
    setSaving("profile")

    try {
      syncUser(await api.updateAccountProfile({ name: profileNameValue }))
      toast.success("账号资料已保存")
      closeDialog()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "账号资料保存失败")
    } finally {
      setSaving(null)
    }
  }

  async function saveEmail() {
    setSaving("email")

    try {
      const result = await api.updateAccountEmail({
        email: emailValue,
        current_password: emailPassword || undefined,
      })
      syncUser(result.user)
      setEmailPassword("")
      toast.success(result.verificationRequired ? "验证邮件已发送" : "邮箱已更新")
      closeDialog()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "邮箱更新失败")
    } finally {
      setSaving(null)
    }
  }

  async function savePassword() {
    setSaving("password")

    try {
      syncUser(
        await api.updateAccountPassword({
          current_password: currentPassword || undefined,
          password: newPassword,
          password_confirmation: confirmPassword,
        })
      )
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      toast.success("密码已更新")
      closeDialog()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "密码更新失败")
    } finally {
      setSaving(null)
    }
  }

  async function sendTwoFactorCode() {
    setSaving("two-factor-send")

    try {
      await api.sendTwoFactorChallenge({
        current_password: twoFactorPassword || undefined,
      })
      setTwoFactorSent(true)
      toast.success("验证码已发送")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "验证码发送失败")
    } finally {
      setSaving(null)
    }
  }

  async function enableTwoFactor() {
    setSaving("two-factor")

    try {
      syncUser(
        await api.updateTwoFactor({
          enabled: true,
          code: twoFactorCode,
          current_password: twoFactorPassword || undefined,
        })
      )
      setTwoFactorCode("")
      setTwoFactorPassword("")
      setTwoFactorSent(false)
      toast.success("两步验证已启用")
      closeDialog()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "两步验证启用失败")
    } finally {
      setSaving(null)
    }
  }

  async function disableTwoFactor() {
    setSaving("two-factor")

    try {
      syncUser(
        await api.updateTwoFactor({
          enabled: false,
          current_password: twoFactorPassword || undefined,
        })
      )
      setTwoFactorCode("")
      setTwoFactorPassword("")
      setTwoFactorSent(false)
      toast.success("两步验证已关闭")
      closeDialog()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "两步验证关闭失败")
    } finally {
      setSaving(null)
    }
  }

  async function bindLinuxDo() {
    setSaving("linuxdo-bind")

    try {
      const { redirectUrl } = await api.bindLinuxDo()
      window.location.href = redirectUrl
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "LinuxDo 绑定失败")
      setSaving(null)
    }
  }

  async function unlinkLinuxDo() {
    setSaving("linuxdo-unlink")

    try {
      syncUser(
        await api.unlinkLinuxDo({
          current_password: linuxDoPassword || undefined,
        })
      )
      setLinuxDoPassword("")
      toast.success("LinuxDo 已解绑")
      closeDialog()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "LinuxDo 解绑失败")
    } finally {
      setSaving(null)
    }
  }

  async function deleteAccount() {
    setSaving("delete")

    try {
      await api.deleteAccount({
        current_password: deletePassword || undefined,
        confirmation: deleteConfirmation,
      })
      clearSession()
      toast.success("账号已注销")
      router.replace("/login")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "账号注销失败")
    } finally {
      setSaving(null)
    }
  }

  const currentUser = accountUser ?? user
  const profileNameValue = profileName
  const emailValue = email
  const hasPassword = currentUser?.hasPassword === true
  const deleteExpected = currentUser?.email || currentUser?.name || ""
  const twoFactorEnabled = currentUser?.twoFactorEnabled === true
  const linuxDoBound = Boolean(currentUser?.linuxdoId)
  const profileSummary = currentUser?.name ?? "-"
  const emailSummary = currentUser?.email ?? "未绑定"
  const passwordSummary = hasPassword ? "已设置" : "未设置"
  const twoFactorSummary = twoFactorEnabled ? "已启用" : "未启用"
  const linuxDoSummary = linuxDoBound
    ? "已绑定"
    : linuxDoAvailable
      ? "未绑定"
      : "未启用"

  return (
    <>
      <PageHeading title="设置" />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>账号设置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SettingsRow
                label="账号资料"
                value={profileSummary}
                actionLabel="修改"
                onAction={openProfileDialog}
              />
              <SettingsRow
                label="邮箱"
                value={emailSummary}
                badge={currentUser?.emailVerifiedAt ? "已验证" : "未验证"}
                actionLabel="修改"
                onAction={openEmailDialog}
              />
              <SettingsRow
                label="密码"
                value={passwordSummary}
                actionLabel={hasPassword ? "修改" : "设置"}
                onAction={openPasswordDialog}
              />
              <SettingsRow
                label="两步验证"
                value={twoFactorSummary}
                badge={twoFactorSummary}
                actionLabel={twoFactorEnabled ? "管理" : "启用"}
                onAction={openTwoFactorDialog}
              />
              <SettingsRow
                label="LinuxDo"
                value={linuxDoSummary}
                badge={linuxDoBound ? "已绑定" : undefined}
                actionLabel={linuxDoBound ? "解绑" : "绑定"}
                actionVariant={linuxDoBound ? "destructive" : "outline"}
                actionDisabled={
                  saving === "linuxdo-bind" || (!linuxDoBound && !linuxDoAvailable)
                }
                onAction={linuxDoBound ? openLinuxDoUnlinkDialog : bindLinuxDo}
              />
              <SettingsRow
                label="账号注销"
                value="永久删除当前账号"
                actionLabel="注销"
                actionVariant="destructive"
                onAction={openDeleteDialog}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>接口配置</CardTitle>
                <Badge variant={config.configured ? "secondary" : "outline"}>
                  {config.configured ? "已配置" : "未配置"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <SettingsRow
                label="Mimo API"
                value={config.enabled ? "个人配置启用，不计入额度" : "使用系统配置"}
                badge={config.configured ? "已配置" : "未配置"}
                actionLabel="配置"
                onAction={() => setDialog("mimo")}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>账号信息</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <InfoLine label="名称" value={currentUser?.name ?? "-"} />
            <InfoLine label="邮箱" value={currentUser?.email ?? "-"} />
            <InfoLine
              label="角色"
              value={currentUser?.role === "admin" ? "管理员" : "用户"}
            />
            <InfoLine
              label="密码"
              value={hasPassword ? "已设置" : "未设置"}
            />
            <InfoLine
              label="两步验证"
              value={twoFactorEnabled ? "已启用" : "未启用"}
            />
            <InfoLine label="LinuxDo" value={linuxDoSummary} />
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialog === "profile"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>账号资料</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="account-name">名称</FieldLabel>
              <Input
                id="account-name"
                value={profileNameValue}
                onChange={(event) => setProfileName(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              取消
            </Button>
            <Button
              onClick={saveProfile}
              disabled={saving === "profile" || !profileNameValue.trim()}
            >
              {saving === "profile" ? (
                <IconLoader2 data-icon="inline-start" />
              ) : (
                <IconDeviceFloppy data-icon="inline-start" />
              )}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "email"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>邮箱</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="account-email">邮箱</FieldLabel>
              <Input
                id="account-email"
                type="email"
                value={emailValue}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            {hasPassword && (
              <Field>
                <FieldLabel htmlFor="email-current-password">
                  当前密码
                </FieldLabel>
                <Input
                  id="email-current-password"
                  type="password"
                  value={emailPassword}
                  onChange={(event) => setEmailPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </Field>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              取消
            </Button>
            <Button onClick={saveEmail} disabled={saving === "email" || !emailValue}>
              {saving === "email" ? (
                <IconLoader2 data-icon="inline-start" />
              ) : (
                <IconMail data-icon="inline-start" />
              )}
              更新邮箱
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "password"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>密码</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            {hasPassword && (
              <Field>
                <FieldLabel htmlFor="current-password">当前密码</FieldLabel>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="new-password">新密码</FieldLabel>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm-password">确认密码</FieldLabel>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              取消
            </Button>
            <Button
              onClick={savePassword}
              disabled={saving === "password" || !newPassword || !confirmPassword}
            >
              {saving === "password" ? (
                <IconLoader2 data-icon="inline-start" />
              ) : (
                <IconDeviceFloppy data-icon="inline-start" />
              )}
              更新密码
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "two-factor"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>两步验证</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            {!currentUser?.email && (
              <Alert>
                <IconMail />
                <AlertTitle>启用前需要绑定邮箱</AlertTitle>
              </Alert>
            )}
            {hasPassword && (
              <Field>
                <FieldLabel htmlFor="two-factor-password">当前密码</FieldLabel>
                <Input
                  id="two-factor-password"
                  type="password"
                  value={twoFactorPassword}
                  onChange={(event) => setTwoFactorPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </Field>
            )}
            {!twoFactorEnabled && (
              <Field>
                <FieldLabel htmlFor="two-factor-code">验证码</FieldLabel>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Input
                    id="two-factor-code"
                    value={twoFactorCode}
                    onChange={(event) => setTwoFactorCode(event.target.value)}
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={sendTwoFactorCode}
                    disabled={saving === "two-factor-send" || !currentUser?.email}
                  >
                    {saving === "two-factor-send" ? (
                      <IconLoader2 data-icon="inline-start" />
                    ) : (
                      <IconMail data-icon="inline-start" />
                    )}
                    发送验证码
                  </Button>
                </div>
              </Field>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              取消
            </Button>
            {twoFactorEnabled ? (
              <Button
                variant="outline"
                onClick={disableTwoFactor}
                disabled={saving === "two-factor"}
              >
                {saving === "two-factor" ? (
                  <IconLoader2 data-icon="inline-start" />
                ) : (
                  <IconShieldCheck data-icon="inline-start" />
                )}
                关闭
              </Button>
            ) : (
              <Button
                onClick={enableTwoFactor}
                disabled={
                  saving === "two-factor" ||
                  !twoFactorSent ||
                  twoFactorCode.length !== 6
                }
              >
                {saving === "two-factor" ? (
                  <IconLoader2 data-icon="inline-start" />
                ) : (
                  <IconShieldCheck data-icon="inline-start" />
                )}
                启用
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "linuxdo-unlink"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>解绑 LinuxDo</DialogTitle>
            <DialogDescription>
              解绑后将无法继续使用该 LinuxDo 账号登录当前账号。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {!hasPassword && (
              <Alert>
                <IconShieldCheck />
                <AlertTitle>请先设置密码后再解绑 LinuxDo</AlertTitle>
              </Alert>
            )}
            {hasPassword && (
              <Field>
                <FieldLabel htmlFor="linuxdo-password">当前密码</FieldLabel>
                <Input
                  id="linuxdo-password"
                  type="password"
                  value={linuxDoPassword}
                  onChange={(event) => setLinuxDoPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </Field>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={unlinkLinuxDo}
              disabled={
                saving === "linuxdo-unlink" || !hasPassword || !linuxDoPassword
              }
            >
              {saving === "linuxdo-unlink" ? (
                <IconLoader2 data-icon="inline-start" />
              ) : (
                <IconUnlink data-icon="inline-start" />
              )}
              解绑
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "delete"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>账号注销</DialogTitle>
            <DialogDescription>
              注销后账号和关联任务记录将被删除。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {hasPassword && (
              <Field>
                <FieldLabel htmlFor="delete-password">当前密码</FieldLabel>
                <Input
                  id="delete-password"
                  type="password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  autoComplete="current-password"
                />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="delete-confirmation">确认内容</FieldLabel>
              <Input
                id="delete-confirmation"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                placeholder={deleteExpected}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={deleteAccount}
              disabled={saving === "delete" || deleteConfirmation !== deleteExpected}
            >
              {saving === "delete" ? (
                <IconLoader2 data-icon="inline-start" />
              ) : (
                <IconTrash data-icon="inline-start" />
              )}
              注销账号
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "mimo"} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>接口配置</DialogTitle>
          </DialogHeader>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>启用个人配置</FieldTitle>
              </FieldContent>
              <Switch
                checked={Boolean(config.enabled)}
                onCheckedChange={(enabled) =>
                  setConfig((current) => ({ ...current, enabled }))
                }
              />
            </Field>
            <Separator />
            <Field>
              <FieldLabel htmlFor="user-base-url">API 地址</FieldLabel>
              <Input
                id="user-base-url"
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
              <FieldLabel htmlFor="user-api-key">API Key</FieldLabel>
              <Input
                id="user-api-key"
                value={config.api_key ?? ""}
                type="password"
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    api_key: event.target.value,
                  }))
                }
                placeholder={config.configured ? "保持当前密钥" : "输入密钥"}
                required={!config.configured}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              取消
            </Button>
            <Button onClick={save} disabled={saving === "mimo"}>
              {saving === "mimo" ? (
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

function SettingsRow({
  label,
  value,
  badge,
  actionLabel,
  actionVariant = "outline",
  actionDisabled = false,
  onAction,
}: {
  label: string
  value: string
  badge?: string
  actionLabel: string
  actionVariant?: "outline" | "destructive"
  actionDisabled?: boolean
  onAction: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <span className="truncate text-sm text-muted-foreground" title={value}>
            {value}
          </span>
          {badge && (
            <Badge variant="outline" className="shrink-0">
              {badge}
            </Badge>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant={actionVariant}
        size="sm"
        disabled={actionDisabled}
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </div>
  )
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="truncate font-medium" title={value}>
        {value}
      </span>
    </div>
  )
}
