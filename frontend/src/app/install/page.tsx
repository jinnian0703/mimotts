"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { IconCheck, IconLoader2 } from "@tabler/icons-react"
import { toast } from "sonner"

import { api } from "@/lib/api"
import { setStoredInstallStatus } from "@/lib/session"
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
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

type Requirement = "required" | "optional"

function RequirementBadge({ requirement }: { requirement: Requirement }) {
  return (
    <Badge variant={requirement === "required" ? "secondary" : "outline"}>
      {requirement === "required" ? "必填" : "可选"}
    </Badge>
  )
}

function FieldLegendWithRequirement({
  children,
  requirement,
}: {
  children: ReactNode
  requirement: Requirement
}) {
  return (
    <FieldLegend className="flex items-center gap-2">
      {children}
      <RequirementBadge requirement={requirement} />
    </FieldLegend>
  )
}

function FieldLabelWithRequirement({
  children,
  htmlFor,
  requirement,
}: {
  children: ReactNode
  htmlFor: string
  requirement: Requirement
}) {
  return (
    <FieldLabel htmlFor={htmlFor}>
      {children}
      <RequirementBadge requirement={requirement} />
    </FieldLabel>
  )
}

export default function InstallPage() {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [smtpEnabled, setSmtpEnabled] = useState(false)
  const [mailDriver, setMailDriver] = useState<"smtp" | "api">("smtp")
  const [appUrl, setAppUrl] = useState("")
  const [frontendUrl, setFrontendUrl] = useState("")
  const [linuxdoRedirectUri, setLinuxdoRedirectUri] = useState("")

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const origin = window.location.origin
      setAppUrl(origin)
      setFrontendUrl(origin)
      setLinuxdoRedirectUri(`${origin}/api/auth/linuxdo/callback`)
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)

    const data = new FormData(event.currentTarget)
    const linuxdoClientId = String(data.get("linuxdo_client_id") || "").trim()
    const linuxdoClientSecret = String(
      data.get("linuxdo_client_secret") || ""
    ).trim()

    if (
      (linuxdoClientId && !linuxdoClientSecret) ||
      (!linuxdoClientId && linuxdoClientSecret)
    ) {
      toast.error("LinuxDo Connect 需同时填写 Client ID 和 Client Secret")
      setPending(false)
      return
    }

    const payload = {
      app_url: appUrl,
      frontend_url: frontendUrl,
      admin_name: String(data.get("admin_name") || ""),
      admin_email: String(data.get("admin_email") || ""),
      admin_password: String(data.get("admin_password") || ""),
      admin_password_confirmation: String(
        data.get("admin_password_confirmation") || ""
      ),
      linuxdo_client_id: linuxdoClientId,
      linuxdo_client_secret: linuxdoClientSecret,
      linuxdo_redirect_uri: linuxdoRedirectUri.trim(),
      mimo_base_url: String(data.get("mimo_base_url") || "").trim(),
      mimo_api_key: String(data.get("mimo_api_key") || "").trim(),
      email_auth: smtpEnabled
        ? {
            enabled: true,
            driver: mailDriver,
            smtp_host: String(data.get("smtp_host") || ""),
            smtp_port: Number(data.get("smtp_port") || 587),
            smtp_username: String(data.get("smtp_username") || ""),
            smtp_password: String(data.get("smtp_password") || ""),
            smtp_encryption: String(data.get("smtp_encryption") || "tls") as
              | "none"
              | "tls"
              | "ssl",
            mail_api_provider: String(
              data.get("mail_api_provider") || "generic_json"
            ) as "generic_json" | "resend",
            mail_api_endpoint: String(data.get("mail_api_endpoint") || ""),
            mail_api_token: String(data.get("mail_api_token") || ""),
            mail_from_address: String(data.get("mail_from_address") || ""),
            mail_from_name: String(data.get("mail_from_name") || ""),
          }
        : { enabled: true },
    }

    try {
      await api.install(payload)
      setStoredInstallStatus({
        installed: true,
        administratorBound: true,
        emailAuthEnabled: true,
      })

      toast.success("安装完成")
      router.replace("/login")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "安装失败")
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-6 sm:px-6 lg:px-8">
      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-6xl">
        <Card>
          <CardHeader>
            <CardTitle>系统安装</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-6 xl:grid-cols-2">
              <FieldGroup className="gap-6">
                <FieldSet>
                  <FieldLegendWithRequirement requirement="required">
                    站点
                  </FieldLegendWithRequirement>
                  <FieldGroup className="grid gap-5 md:grid-cols-2">
                    <Field>
                      <FieldLabelWithRequirement
                        htmlFor="app_url"
                        requirement="required"
                      >
                        后端地址
                      </FieldLabelWithRequirement>
                      <Input
                        id="app_url"
                        name="app_url"
                        type="url"
                        value={appUrl}
                        onChange={(event) => setAppUrl(event.target.value)}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabelWithRequirement
                        htmlFor="frontend_url"
                        requirement="required"
                      >
                        前端地址
                      </FieldLabelWithRequirement>
                      <Input
                        id="frontend_url"
                        name="frontend_url"
                        type="url"
                        value={frontendUrl}
                        onChange={(event) =>
                          setFrontendUrl(event.target.value)
                        }
                        required
                      />
                    </Field>
                  </FieldGroup>
                </FieldSet>

                <FieldSet>
                  <FieldLegendWithRequirement requirement="required">
                    管理员
                  </FieldLegendWithRequirement>
                  <FieldGroup className="grid gap-5 md:grid-cols-2">
                    <Field>
                      <FieldLabelWithRequirement
                        htmlFor="admin_name"
                        requirement="required"
                      >
                        名称
                      </FieldLabelWithRequirement>
                      <Input id="admin_name" name="admin_name" required />
                    </Field>
                    <Field>
                      <FieldLabelWithRequirement
                        htmlFor="admin_email"
                        requirement="required"
                      >
                        邮箱
                      </FieldLabelWithRequirement>
                      <Input
                        id="admin_email"
                        name="admin_email"
                        type="email"
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabelWithRequirement
                        htmlFor="admin_password"
                        requirement="required"
                      >
                        密码
                      </FieldLabelWithRequirement>
                      <Input
                        id="admin_password"
                        name="admin_password"
                        type="password"
                        minLength={8}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabelWithRequirement
                        htmlFor="admin_password_confirmation"
                        requirement="required"
                      >
                        确认密码
                      </FieldLabelWithRequirement>
                      <Input
                        id="admin_password_confirmation"
                        name="admin_password_confirmation"
                        type="password"
                        minLength={8}
                        required
                      />
                    </Field>
                  </FieldGroup>
                </FieldSet>
              </FieldGroup>

              <FieldGroup className="gap-6">
                <FieldSet>
                  <FieldLegendWithRequirement requirement="optional">
                    Mimo API
                  </FieldLegendWithRequirement>
                  <FieldGroup className="grid gap-5 md:grid-cols-2">
                    <Field>
                      <FieldLabelWithRequirement
                        htmlFor="mimo_base_url"
                        requirement="optional"
                      >
                        接口地址
                      </FieldLabelWithRequirement>
                      <Input
                        id="mimo_base_url"
                        name="mimo_base_url"
                        type="url"
                        defaultValue="https://api.xiaomimimo.com/v1"
                      />
                    </Field>
                    <Field>
                      <FieldLabelWithRequirement
                        htmlFor="mimo_api_key"
                        requirement="optional"
                      >
                        API Key
                      </FieldLabelWithRequirement>
                      <Input
                        id="mimo_api_key"
                        name="mimo_api_key"
                        type="password"
                      />
                    </Field>
                  </FieldGroup>
                </FieldSet>

                <FieldSet>
                  <FieldLegendWithRequirement requirement="optional">
                    邮件投递配置
                  </FieldLegendWithRequirement>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldLabelWithRequirement
                        htmlFor="smtp_enabled"
                        requirement="optional"
                      >
                        启用邮箱
                      </FieldLabelWithRequirement>
                    </FieldContent>
                    <Switch
                      id="smtp_enabled"
                      checked={smtpEnabled}
                      onCheckedChange={setSmtpEnabled}
                    />
                  </Field>
                  {smtpEnabled && (
                    <FieldGroup className="grid gap-5 md:grid-cols-2">
                      <Field className="md:col-span-2">
                        <FieldLabelWithRequirement
                          htmlFor="mail_driver"
                          requirement="optional"
                        >
                          投递方式
                        </FieldLabelWithRequirement>
                        <Select
                          value={mailDriver}
                          onValueChange={(value) =>
                            setMailDriver(value === "api" ? "api" : "smtp")
                          }
                        >
                          <SelectTrigger id="mail_driver" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="smtp">SMTP</SelectItem>
                              <SelectItem value="api">邮件 API</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      {mailDriver === "api" ? (
                        <>
                          <Field>
                            <FieldLabelWithRequirement
                              htmlFor="mail_api_provider"
                              requirement="optional"
                            >
                              API 类型
                            </FieldLabelWithRequirement>
                            <Select
                              name="mail_api_provider"
                              defaultValue="generic_json"
                            >
                              <SelectTrigger
                                id="mail_api_provider"
                                className="w-full"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="generic_json">
                                    通用 JSON
                                  </SelectItem>
                                  <SelectItem value="resend">
                                    Resend
                                  </SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field>
                            <FieldLabelWithRequirement
                              htmlFor="mail_api_endpoint"
                              requirement="required"
                            >
                              API 地址
                            </FieldLabelWithRequirement>
                            <Input
                              id="mail_api_endpoint"
                              name="mail_api_endpoint"
                              type="url"
                              required
                              placeholder="https://mail.example.com/send"
                            />
                          </Field>
                          <Field>
                            <FieldLabelWithRequirement
                              htmlFor="mail_api_token"
                              requirement="required"
                            >
                              API Token
                            </FieldLabelWithRequirement>
                            <Input
                              id="mail_api_token"
                              name="mail_api_token"
                              type="password"
                              required
                            />
                          </Field>
                        </>
                      ) : (
                        <>
                          <Field>
                            <FieldLabelWithRequirement
                              htmlFor="smtp_host"
                              requirement="required"
                            >
                              SMTP 主机
                            </FieldLabelWithRequirement>
                            <Input id="smtp_host" name="smtp_host" required />
                          </Field>
                          <Field>
                            <FieldLabelWithRequirement
                              htmlFor="smtp_port"
                              requirement="optional"
                            >
                              SMTP 端口
                            </FieldLabelWithRequirement>
                            <Input
                              id="smtp_port"
                              name="smtp_port"
                              type="number"
                              min="1"
                              max="65535"
                              defaultValue="587"
                            />
                          </Field>
                          <Field>
                            <FieldLabelWithRequirement
                              htmlFor="smtp_username"
                              requirement="optional"
                            >
                              SMTP 用户名
                            </FieldLabelWithRequirement>
                            <Input id="smtp_username" name="smtp_username" />
                          </Field>
                          <Field>
                            <FieldLabelWithRequirement
                              htmlFor="smtp_password"
                              requirement="optional"
                            >
                              SMTP 密码
                            </FieldLabelWithRequirement>
                            <Input
                              id="smtp_password"
                              name="smtp_password"
                              type="password"
                            />
                          </Field>
                          <Field>
                            <FieldLabelWithRequirement
                              htmlFor="smtp_encryption"
                              requirement="optional"
                            >
                              加密方式
                            </FieldLabelWithRequirement>
                            <Select name="smtp_encryption" defaultValue="tls">
                              <SelectTrigger
                                id="smtp_encryption"
                                className="w-full"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="tls">TLS</SelectItem>
                                  <SelectItem value="ssl">SSL</SelectItem>
                                  <SelectItem value="none">无</SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </Field>
                        </>
                      )}
                      <Field>
                        <FieldLabelWithRequirement
                          htmlFor="mail_from_address"
                          requirement="required"
                        >
                          发件邮箱
                        </FieldLabelWithRequirement>
                        <Input
                          id="mail_from_address"
                          name="mail_from_address"
                          type="email"
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabelWithRequirement
                          htmlFor="mail_from_name"
                          requirement="optional"
                        >
                          发件名称
                        </FieldLabelWithRequirement>
                        <Input id="mail_from_name" name="mail_from_name" />
                      </Field>
                    </FieldGroup>
                  )}
                </FieldSet>

                <FieldSet>
                  <FieldLegendWithRequirement requirement="optional">
                    LinuxDo Connect
                  </FieldLegendWithRequirement>
                  <FieldGroup className="grid gap-5 md:grid-cols-2">
                    <Field>
                      <FieldLabelWithRequirement
                        htmlFor="linuxdo_client_id"
                        requirement="optional"
                      >
                        Client ID
                      </FieldLabelWithRequirement>
                      <Input id="linuxdo_client_id" name="linuxdo_client_id" />
                    </Field>
                    <Field>
                      <FieldLabelWithRequirement
                        htmlFor="linuxdo_client_secret"
                        requirement="optional"
                      >
                        Client Secret
                      </FieldLabelWithRequirement>
                      <Input
                        id="linuxdo_client_secret"
                        name="linuxdo_client_secret"
                        type="password"
                      />
                    </Field>
                    <Field className="md:col-span-2">
                      <FieldLabelWithRequirement
                        htmlFor="linuxdo_redirect_uri"
                        requirement="optional"
                      >
                        Redirect URI
                      </FieldLabelWithRequirement>
                      <Input
                        id="linuxdo_redirect_uri"
                        name="linuxdo_redirect_uri"
                        type="url"
                        value={linuxdoRedirectUri}
                        onChange={(event) =>
                          setLinuxdoRedirectUri(event.target.value)
                        }
                      />
                    </Field>
                  </FieldGroup>
                </FieldSet>
              </FieldGroup>
            </FieldGroup>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <IconLoader2 data-icon="inline-start" />
              ) : (
                <IconCheck data-icon="inline-start" />
              )}
              执行安装
            </Button>
          </CardFooter>
        </Card>
      </form>
    </main>
  )
}
