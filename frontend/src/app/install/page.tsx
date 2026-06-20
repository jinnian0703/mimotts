"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  IconAlertTriangle,
  IconCheck,
  IconCircleCheck,
  IconLoader2,
  IconSettings,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { api, apiPath } from "@/lib/api"
import { setStoredInstallStatus } from "@/lib/session"
import type { InstallStatus } from "@/lib/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
type DatabaseConnection = "mysql" | "sqlite"

function buildLinuxDoRedirectUri(origin: string) {
  if (!origin) {
    return ""
  }

  try {
    return new URL(apiPath("/auth/linuxdo/callback"), origin).toString()
  } catch {
    return `${origin.replace(/\/$/, "")}${apiPath("/auth/linuxdo/callback")}`
  }
}

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
  const [installStatus, setInstallStatus] = useState<InstallStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [smtpEnabled, setSmtpEnabled] = useState(false)
  const [mailDriver, setMailDriver] = useState<"smtp" | "api">("smtp")
  const [dbConnection, setDbConnection] =
    useState<DatabaseConnection>("mysql")
  const [appUrl, setAppUrl] = useState("")
  const [frontendUrl, setFrontendUrl] = useState("")
  const [linuxdoRedirectUri, setLinuxdoRedirectUri] = useState("")

  const isDockerInstall = installStatus?.deployment?.mode === "docker"

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const origin = window.location.origin
      setAppUrl(origin)
      setFrontendUrl(origin)
      setLinuxdoRedirectUri(buildLinuxDoRedirectUri(origin))
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [])

  useEffect(() => {
    let cancelled = false

    api
      .installStatus()
      .then((status) => {
        if (!cancelled) {
          setInstallStatus(status)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInstallStatus({
            installed: false,
            installState: "config_error",
            stateMessage: "安装状态读取失败，请检查 API 入口、数据库和 APP_KEY",
            configError: true,
          })
        }
      })
      .finally(() => {
        if (!cancelled) {
          setStatusLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const installed =
      installStatus?.installed === true &&
      (installStatus.administratorBound ?? installStatus.admin_bound ?? true)

    if (!statusLoading && installed) {
      router.replace("/login")
    }
  }, [installStatus, router, statusLoading])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)

    const data = new FormData(event.currentTarget)
    const linuxdoClientId = String(data.get("linuxdo_client_id") || "").trim()
    const linuxdoClientSecret = String(
      data.get("linuxdo_client_secret") || ""
    ).trim()
    const selectedDbConnection: DatabaseConnection = isDockerInstall ||
      String(data.get("db_connection") || "mysql") === "sqlite"
      ? "sqlite"
      : "mysql"
    const dbHost = String(data.get("db_host") || "").trim()
    const dbPort = Number(data.get("db_port") || 3306)
    const dbDatabase = isDockerInstall
      ? "/var/www/backend/storage/database.sqlite"
      : String(data.get("db_database") || "").trim()
    const dbUsername = String(data.get("db_username") || "").trim()
    const dbPassword = String(data.get("db_password") || "")

    if (
      (linuxdoClientId && !linuxdoClientSecret) ||
      (!linuxdoClientId && linuxdoClientSecret)
    ) {
      toast.error("LinuxDo Connect 需同时填写 Client ID 和 Client Secret")
      setPending(false)
      return
    }

    if (
      selectedDbConnection === "mysql" &&
      (!dbHost || !dbPort || !dbDatabase || !dbUsername || !dbPassword)
    ) {
      toast.error("请完整填写数据库连接信息")
      setPending(false)
      return
    }

    if (selectedDbConnection === "sqlite" && !dbDatabase) {
      toast.error("请填写 SQLite 数据库文件名")
      setPending(false)
      return
    }

    const payload = {
      app_url: appUrl,
      frontend_url: frontendUrl,
      db_connection: selectedDbConnection,
      db_host: selectedDbConnection === "mysql" ? dbHost : undefined,
      db_port: selectedDbConnection === "mysql" ? dbPort : undefined,
      db_database: dbDatabase,
      db_username:
        selectedDbConnection === "mysql" ? dbUsername : undefined,
      db_password:
        selectedDbConnection === "mysql" ? dbPassword : undefined,
      admin_name: String(data.get("admin_name") || ""),
      admin_email: String(data.get("admin_email") || ""),
      admin_password: String(data.get("admin_password") || ""),
      admin_password_confirmation: String(
        data.get("admin_password_confirmation") || ""
      ),
      linuxdo_client_id: isDockerInstall ? undefined : linuxdoClientId,
      linuxdo_client_secret: isDockerInstall
        ? undefined
        : linuxdoClientSecret,
      linuxdo_redirect_uri: isDockerInstall
        ? undefined
        : linuxdoRedirectUri.trim(),
      mimo_base_url: isDockerInstall
        ? undefined
        : String(data.get("mimo_base_url") || "").trim(),
      mimo_api_key: isDockerInstall
        ? undefined
        : String(data.get("mimo_api_key") || "").trim(),
      email_auth: isDockerInstall
        ? undefined
        : smtpEnabled
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

  const installState =
    installStatus?.installState ?? installStatus?.install_state ?? "uninstalled"
  const missingConfig =
    installStatus?.missingConfig ?? installStatus?.missing_config ?? []
  const showInstallForm =
    statusLoading || installState === "uninstalled"

  return (
    <main className="min-h-dvh bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto mb-4 w-full max-w-6xl">
        <InstallStatePanel
          status={installStatus}
          loading={statusLoading}
          onLogin={() => router.replace("/login")}
        />
      </div>

      {showInstallForm ? (
      <form onSubmit={handleSubmit} className="mx-auto w-full max-w-6xl">
        <Card>
          <CardHeader>
            <CardTitle>系统安装</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup className={isDockerInstall ? "grid gap-6" : "grid gap-6 xl:grid-cols-2"}>
              <FieldGroup className="gap-6">
                {isDockerInstall ? (
                  <FieldSet>
                    <FieldLegendWithRequirement requirement="optional">
                      Docker 自动配置
                    </FieldLegendWithRequirement>
                    <Alert>
                      <IconCircleCheck />
                      <AlertTitle>已使用当前访问地址和内置 SQLite</AlertTitle>
                      <AlertDescription>
                        数据库文件、迁移、APP_KEY、运行目录和 .env 中的接口/登录配置会由容器自动准备。
                      </AlertDescription>
                    </Alert>
                  </FieldSet>
                ) : (
                <>
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
                        onChange={(event) => {
                          const value = event.target.value
                          setAppUrl(value)
                          setLinuxdoRedirectUri(buildLinuxDoRedirectUri(value))
                        }}
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
                    数据库
                  </FieldLegendWithRequirement>
                  <FieldGroup className="grid gap-5 md:grid-cols-2">
                      <Field className="md:col-span-2">
                        <FieldLabelWithRequirement
                          htmlFor="db_connection"
                          requirement="required"
                        >
                          类型
                        </FieldLabelWithRequirement>
                        <Select
                          name="db_connection"
                          value={dbConnection}
                          onValueChange={(value) =>
                            setDbConnection(
                              value === "sqlite" ? "sqlite" : "mysql"
                            )
                          }
                        >
                          <SelectTrigger id="db_connection" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="mysql">
                                MySQL / MariaDB
                              </SelectItem>
                              <SelectItem value="sqlite">SQLite</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>

                      {dbConnection === "mysql" ? (
                        <>
                          <Field>
                            <FieldLabelWithRequirement
                              htmlFor="db_host"
                              requirement="required"
                            >
                              主机
                            </FieldLabelWithRequirement>
                            <Input
                              id="db_host"
                              name="db_host"
                              defaultValue="127.0.0.1"
                              required
                            />
                          </Field>
                          <Field>
                            <FieldLabelWithRequirement
                              htmlFor="db_port"
                              requirement="required"
                            >
                              端口
                            </FieldLabelWithRequirement>
                            <Input
                              id="db_port"
                              name="db_port"
                              type="number"
                              min="1"
                              max="65535"
                              defaultValue="3306"
                              required
                            />
                          </Field>
                          <Field>
                            <FieldLabelWithRequirement
                              htmlFor="db_database"
                              requirement="required"
                            >
                              数据库名
                            </FieldLabelWithRequirement>
                            <Input
                              id="db_database"
                              name="db_database"
                              defaultValue="mimo"
                              required
                            />
                          </Field>
                          <Field>
                            <FieldLabelWithRequirement
                              htmlFor="db_username"
                              requirement="required"
                            >
                              用户名
                            </FieldLabelWithRequirement>
                            <Input
                              id="db_username"
                              name="db_username"
                              defaultValue="mimo"
                              required
                            />
                          </Field>
                          <Field className="md:col-span-2">
                            <FieldLabelWithRequirement
                              htmlFor="db_password"
                              requirement="required"
                            >
                              密码
                            </FieldLabelWithRequirement>
                            <Input
                              id="db_password"
                              name="db_password"
                              type="password"
                              required
                            />
                          </Field>
                        </>
                      ) : (
                        <Field className="md:col-span-2">
                          <FieldLabelWithRequirement
                            htmlFor="db_database"
                            requirement="required"
                          >
                            数据库文件
                          </FieldLabelWithRequirement>
                          <Input
                            id="db_database"
                            name="db_database"
                            defaultValue="database.sqlite"
                            required
                          />
                        </Field>
                      )}
                  </FieldGroup>
                </FieldSet>
                </>
                )}

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

              {!isDockerInstall && (
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
              )}
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
      ) : (
        <div className="mx-auto w-full max-w-6xl">
          <Card>
            <CardHeader>
              <CardTitle>
                {installState === "installed_needs_config"
                  ? "安装已完成，仍需补齐配置"
                  : installState === "config_error"
                    ? "配置异常"
                    : "系统已安装"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                <InstallStateTile
                  label="安装状态"
                  value={stateLabel(installState)}
                />
                <InstallStateTile
                  label="版本"
                  value={installStatus?.build?.version || "dev"}
                />
                <InstallStateTile
                  label="构建时间"
                  value={
                    installStatus?.build?.builtAt ??
                    installStatus?.build?.built_at ??
                    "未记录"
                  }
                />
              </div>
              {missingConfig.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {missingConfig.map((item) => (
                    <Badge key={item} variant="outline">
                      {missingConfigLabel(item)}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter className="justify-end">
              <Button onClick={() => router.replace("/login")}>
                <IconSettings data-icon="inline-start" />
                进入登录页
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </main>
  )
}

function InstallStatePanel({
  status,
  loading,
  onLogin,
}: {
  status: InstallStatus | null
  loading: boolean
  onLogin: () => void
}) {
  if (loading) {
    return (
      <Alert>
        <IconLoader2 />
        <AlertTitle>正在读取安装状态</AlertTitle>
        <AlertDescription>请稍候。</AlertDescription>
      </Alert>
    )
  }

  const state = status?.installState ?? status?.install_state ?? "uninstalled"
  const missingConfig = status?.missingConfig ?? status?.missing_config ?? []

  if (state === "config_error") {
    return (
      <Alert variant="destructive">
        <IconAlertTriangle />
        <AlertTitle>配置异常</AlertTitle>
        <AlertDescription>
          {status?.stateMessage ??
            status?.state_message ??
            "请检查 APP_KEY、数据库连接和已保存的加密配置。"}
        </AlertDescription>
      </Alert>
    )
  }

  if (state === "installed_needs_config") {
    return (
      <Alert>
        <IconAlertTriangle />
        <AlertTitle>已安装但缺配置</AlertTitle>
        <AlertDescription>
          缺少 {missingConfig.map(missingConfigLabel).join("、") || "关键配置"}。
          管理员登录后到系统配置页补齐即可。
        </AlertDescription>
      </Alert>
    )
  }

  if (state === "installed") {
    return (
      <Alert>
        <IconCircleCheck />
        <AlertTitle>系统已安装</AlertTitle>
        <AlertDescription>
          当前版本 {status?.build?.version || "dev"}，可直接进入登录页。
        </AlertDescription>
        <Button size="sm" variant="outline" className="absolute right-2 top-2" onClick={onLogin}>
          登录
        </Button>
      </Alert>
    )
  }

  return (
    <Alert>
      <IconCheck />
      <AlertTitle>系统未安装</AlertTitle>
      <AlertDescription>填写下方信息后完成首次安装。</AlertDescription>
    </Alert>
  )
}

function InstallStateTile({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border/70 px-4 py-3">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-medium" title={value}>
        {value}
      </div>
    </div>
  )
}

function stateLabel(state: string) {
  return {
    uninstalled: "未安装",
    installed: "已安装",
    installed_needs_config: "已安装但缺配置",
    config_error: "配置异常",
  }[state] ?? state
}

function missingConfigLabel(key: string) {
  return {
    mimo_api: "Mimo API",
    auth_method: "登录方式",
    email_sender: "发件身份",
  }[key] ?? key
}
