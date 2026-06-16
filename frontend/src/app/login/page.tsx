"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  IconBrandOauth,
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
  const [twoFactorEmail, setTwoFactorEmail] = useState("")
  const [verificationMessage, setVerificationMessage] = useState("")
  const [installStatus, setInstallStatus] = useState<InstallStatus | null>(
    null
  )

  useEffect(() => {
    api
      .installStatus()
      .then((status) => {
        setInstallStatus(status)
      })
      .catch(() => {
        setInstallStatus(null)
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

      if (emailMode === "login") {
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
              password_confirmation: String(
                data.get("password_confirmation") || ""
              ),
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

  const linuxDoConfigured = installStatus?.linuxDoConfigured === true

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {twoFactorEmail
              ? "两步验证"
              : emailMode === "login"
                ? "账号登录"
                : "账号注册"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {verificationMessage && (
            <Alert>
              <IconMailCheck />
              <AlertTitle>{verificationMessage}</AlertTitle>
            </Alert>
          )}
          {!twoFactorEmail && (
            <ToggleGroup
              type="single"
              value={emailMode}
              onValueChange={(value) => {
                if (value === "login" || value === "register") {
                  setEmailMode(value)
                }
              }}
              className="w-full"
            >
              <ToggleGroupItem value="login" className="flex-1">
                登录
              </ToggleGroupItem>
              <ToggleGroupItem value="register" className="flex-1">
                注册
              </ToggleGroupItem>
            </ToggleGroup>
          )}

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
              ) : emailMode === "register" && (
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
                        emailMode === "login"
                          ? "current-password"
                          : "new-password"
                      }
                      required
                    />
                  </Field>
                  {emailMode === "register" && (
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
                ) : emailMode === "login" ? (
                  <IconLogin2 data-icon="inline-start" />
                ) : (
                  <IconUserPlus data-icon="inline-start" />
                )}
                {twoFactorEmail
                  ? "验证"
                  : emailMode === "login"
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

          {linuxDoConfigured && !twoFactorEmail && (
            <>
              <Separator />
              <Button
                variant="outline"
                className="w-full"
                onClick={handleLogin}
                disabled={linuxDoPending}
              >
                {linuxDoPending ? (
                  <IconLoader2 data-icon="inline-start" />
                ) : (
                  <IconBrandOauth data-icon="inline-start" />
                )}
                LinuxDo Connect
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
