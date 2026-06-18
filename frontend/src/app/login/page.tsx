"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  IconLoader2,
  IconLogin2,
  IconMailCheck,
  IconShieldCheck,
  IconUserPlus,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import { setSession } from "@/lib/session"
import type { InstallStatus } from "@/lib/types"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type EmailMode = "login" | "register"

export default function LoginPage() {
  const router = useRouter()
  const [linuxDoPending, setLinuxDoPending] = useState(false)
  const [emailPending, setEmailPending] = useState(false)
  const [emailMode, setEmailMode] = useState<EmailMode>("login")
  const [adminEmailLoginVisible, setAdminEmailLoginVisible] = useState(false)
  const [twoFactorEmail, setTwoFactorEmail] = useState("")
  const [verificationMessage, setVerificationMessage] = useState("")
  const [installStatusLoaded, setInstallStatusLoaded] = useState(false)
  const [installStatus, setInstallStatus] = useState<InstallStatus | null>(
    null
  )

  useEffect(() => {
    api
      .installStatus()
      .then((status) => {
        setInstallStatus(status)
        setInstallStatusLoaded(true)
      })
      .catch(() => {
        setInstallStatus(null)
        setInstallStatusLoaded(true)
      })

    api
      .me()
      .then(() => {
        router.replace("/dashboard")
      })
      .catch(() => undefined)

    const params = new URLSearchParams(window.location.search)
    const token = params.get("verify_token")
    const email = params.get("email")
    if (token && email) {
      void resolveVerification(email, token)
    }

    async function resolveVerification(email: string, token: string) {
      setEmailPending(true)
      try {
        const user = await api.verifyEmail({ email, token })
        setSession(user)
        toast.success("邮箱验证已完成")
        router.refresh()
        router.replace("/dashboard")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "邮箱验证失败")
      } finally {
        setEmailPending(false)
      }
    }
  }, [router])

  const linuxDoConfigured = installStatus?.linuxDoLoginEnabled === true
  const emailAuthEnabled = installStatusLoaded
    ? installStatus?.emailAuthEnabled !== false
    : false
  const registrationEnabled = installStatus?.registrationEnabled !== false
  const activeEmailMode: EmailMode =
    emailAuthEnabled && registrationEnabled ? emailMode : "login"
  const showEmailForm =
    installStatusLoaded &&
    (emailAuthEnabled || adminEmailLoginVisible || Boolean(twoFactorEmail))
  const cardTitle = !installStatusLoaded
    ? "账号登录"
    : twoFactorEmail
      ? "两步验证"
      : !emailAuthEnabled
        ? "管理员入口"
        : activeEmailMode === "login"
          ? "账号登录"
          : "账号注册"

  async function handleLogin() {
    setLinuxDoPending(true)

    try {
      const { redirectUrl } = await api.loginWithLinuxDo()
      window.location.href = redirectUrl
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "LinuxDo Connect 授权地址获取失败"
      )
      setLinuxDoPending(false)
    }
  }

  async function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEmailPending(true)

    const data = new FormData(event.currentTarget)
    const email = String(data.get("email") || "")
    const password = String(data.get("password") || "")

    try {
      if (twoFactorEmail) {
        const user = await api.verifyEmailTwoFactor({
          email: twoFactorEmail,
          code: String(data.get("code") || ""),
        })
        setSession(user)
        router.refresh()
        router.replace("/dashboard")
        return
      }

      if (activeEmailMode === "login") {
        const result = await api.loginWithEmail({ email, password })
        if (result.twoFactorRequired) {
          setTwoFactorEmail(result.email)
          toast.success("验证码已发送")
          return
        }

        setSession(result.user)
        router.refresh()
        router.replace("/dashboard")
        return
      }

      const result = await api.registerWithEmail({
        name: String(data.get("name") || ""),
        email,
        password,
        password_confirmation: String(data.get("password_confirmation") || ""),
      })

      if (result.verificationRequired) {
        setVerificationMessage("验证邮件已发送")
        setEmailMode("login")
        toast.success("验证邮件已发送")
        return
      }

      if (!result.user) {
        throw new Error(result.message ?? "注册失败")
      }

      setSession(result.user)
      router.refresh()
      router.replace("/dashboard")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "邮箱认证失败")
    } finally {
      setEmailPending(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{cardTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {verificationMessage && (
            <Alert>
              <IconMailCheck />
              <AlertTitle>{verificationMessage}</AlertTitle>
            </Alert>
          )}
          {!twoFactorEmail && emailAuthEnabled && (
            <ToggleGroup
              type="single"
              value={activeEmailMode}
              onValueChange={(value) => {
                if (
                  value === "login" ||
                  (registrationEnabled && value === "register")
                ) {
                  setEmailMode(value)
                }
              }}
              className="w-full"
            >
              <ToggleGroupItem value="login" className="flex-1">
                登录
              </ToggleGroupItem>
              {registrationEnabled && (
                <ToggleGroupItem value="register" className="flex-1">
                  注册
                </ToggleGroupItem>
              )}
            </ToggleGroup>
          )}

          {!installStatusLoaded ? (
            <Alert>
              <IconLoader2 />
              <AlertTitle>正在加载登录入口</AlertTitle>
            </Alert>
          ) : showEmailForm ? (
            <form onSubmit={handleEmailSubmit}>
              <FieldGroup>
                {twoFactorEmail ? (
                  <>
                    <Alert>
                      <IconShieldCheck />
                      <AlertTitle>验证码已发送至 {twoFactorEmail}</AlertTitle>
                    </Alert>
                    <Field>
                      <FieldLabel htmlFor="code">验证码</FieldLabel>
                      <Input
                        id="code"
                        name="code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        required
                      />
                    </Field>
                  </>
                ) : activeEmailMode === "register" && (
                  <Field>
                    <FieldLabel htmlFor="name">姓名</FieldLabel>
                    <Input id="name" name="name" autoComplete="name" required />
                  </Field>
                )}
                {!twoFactorEmail && (
                  <>
                    <Field>
                      <FieldLabel htmlFor="email">邮箱</FieldLabel>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="password">密码</FieldLabel>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete={
                          activeEmailMode === "login"
                            ? "current-password"
                            : "new-password"
                        }
                        required
                      />
                    </Field>
                    {activeEmailMode === "register" && (
                      <Field>
                        <FieldLabel htmlFor="password_confirmation">
                          确认密码
                        </FieldLabel>
                        <Input
                          id="password_confirmation"
                          name="password_confirmation"
                          type="password"
                          autoComplete="new-password"
                          required
                        />
                      </Field>
                    )}
                  </>
                )}
                <Button type="submit" className="w-full" disabled={emailPending}>
                  {emailPending ? (
                    <IconLoader2 data-icon="inline-start" />
                  ) : twoFactorEmail ? (
                    <IconShieldCheck data-icon="inline-start" />
                  ) : !emailAuthEnabled ? (
                    <IconShieldCheck data-icon="inline-start" />
                  ) : activeEmailMode === "login" ? (
                    <IconLogin2 data-icon="inline-start" />
                  ) : (
                    <IconUserPlus data-icon="inline-start" />
                  )}
                  {twoFactorEmail
                    ? "验证"
                    : !emailAuthEnabled
                      ? "管理员登录"
                    : activeEmailMode === "login"
                      ? "登录"
                      : "注册"}
                </Button>
                {twoFactorEmail && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setTwoFactorEmail("")}
                    disabled={emailPending}
                  >
                    返回登录
                  </Button>
                )}
              </FieldGroup>
            </form>
          ) : (
            <>
              <Alert>
                <IconMailCheck />
                <AlertTitle>
                  邮箱登录已停用，普通用户请使用已开启的登录方式
                </AlertTitle>
              </Alert>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setAdminEmailLoginVisible(true)}
              >
                <IconShieldCheck data-icon="inline-start" />
                管理员登录
              </Button>
            </>
          )}

          {linuxDoConfigured && !twoFactorEmail && (
            <>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <Separator className="flex-1" />
                <span>或继续使用</span>
                <Separator className="flex-1" />
              </div>
              <Button
                variant="outline"
                className="h-11 w-full rounded-2xl font-semibold"
                onClick={handleLogin}
                disabled={linuxDoPending}
              >
                {linuxDoPending ? (
                  <IconLoader2 data-icon="inline-start" />
                ) : (
                  <LinuxDoMark />
                )}
                使用 LinuxDO 继续
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

function LinuxDoMark() {
  return (
    <span
      aria-hidden="true"
      className="relative mr-1 inline-flex size-4 shrink-0 overflow-hidden rounded-full border border-border bg-background"
    >
      <span className="absolute inset-x-0 top-0 h-1/2 bg-foreground" />
      <span className="absolute inset-x-0 bottom-0 h-1/2 bg-[#f0a31a]" />
      <span className="absolute inset-y-1/2 left-0 right-0 h-px -translate-y-1/2 bg-background" />
    </span>
  )
}
