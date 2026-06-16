"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  IconApi,
  IconBolt,
  IconCreditCardPay,
  IconDeviceFloppy,
  IconGift,
  IconHistory,
  IconLayoutDashboard,
  IconLoader2,
  IconMailCheck,
  IconMailCog,
  IconMailForward,
  IconMailShare,
  IconPackage,
  IconPercentage,
  IconPlus,
  IconRefresh,
  IconReceipt2,
  IconServerCog,
  IconShieldCheck,
  IconSparkles,
  IconMicrophone,
  IconTrash,
  IconWaveSine,
  IconWorldWww,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { FieldHelpLabel } from "@/components/field-help-label"
import { useCurrentUser } from "@/components/auth-gate"
import { PageHeading } from "@/components/page-heading"
import { api } from "@/lib/api"
import type {
  BasicInfoConfig,
  BillingConfig,
  BillingPlan,
  EmailApiProvider,
  EmailAuthConfigState,
  MimoConfig,
  SystemSetting,
  UsageCostKey,
} from "@/lib/types"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type PlanDraft = Pick<
  BillingPlan,
  "id" | "name" | "quota" | "base_amount" | "enabled"
>

type SettingsTab =
  | "overview"
  | "basic"
  | "access"
  | "mail"
  | "billing"
  | "records"
type EmailTemplateKey = "verification" | "two_factor"

const defaultMimo: MimoConfig = {
  base_url: "https://api.xiaomimimo.com/v1",
  api_key: "",
  configured: false,
}

const defaultBasicInfo: BasicInfoConfig = {
  system_name: "",
  site_title: "",
  site_subtitle: "",
  app_url: "",
  frontend_url: "",
  icp_record: "",
  footer_text: "",
  support_email: "",
}

const defaultEmailTemplates = {
  verification: {
    subject: "邮箱验证",
    body: "请打开以下链接完成邮箱验证：\n\n{verification_url}\n\n链接 {expires_hours} 小时内有效。",
  },
  two_factor: {
    subject: "两步验证",
    body: "验证码：{code}\n\n验证码 {expires_minutes} 分钟内有效。如非本人操作，请立即修改密码。",
  },
}

const defaultEmail: EmailAuthConfigState = {
  enabled: true,
  verification_required: false,
  driver: "smtp",
  smtp: {},
  api: {
    provider: "generic_json",
    endpoint: "",
    token_configured: false,
  },
  sender: {},
  templates: defaultEmailTemplates,
}

const verificationVariables = [
  "{app_name}",
  "{user_name}",
  "{email}",
  "{verification_url}",
  "{expires_hours}",
  "{expires_minutes}",
]

const twoFactorVariables = [
  "{app_name}",
  "{user_name}",
  "{email}",
  "{code}",
  "{expires_minutes}",
]

const emailVariableHelp: Record<string, string> = {
  "{app_name}": "系统名称",
  "{user_name}": "用户名称",
  "{email}": "用户邮箱",
  "{verification_url}": "邮箱验证链接",
  "{expires_hours}": "有效小时数",
  "{expires_minutes}": "有效分钟数",
  "{code}": "两步验证码",
}

const defaultBilling: BillingConfig = {
  enabled: false,
  provider: "linuxdo_credit",
  provider_name: "LinuxDo Credit",
  configured: false,
  credit_multiplier: 1,
  default_plan_id: "starter",
  gateway_url: "https://credit.linux.do/epay",
  client_id: "",
  client_secret: "",
  usage_costs: {
    asr: 1,
    tts: 1,
    voice_design: 2,
    voice_clone: 3,
  },
  checkin: {
    enabled: false,
    daily_quota: 10,
  },
  plans: [],
  plans_json: "",
}

const usageCostItems: Array<{
  key: UsageCostKey
  label: string
  help: string
  icon: typeof IconBolt
}> = [
  {
    key: "asr",
    label: "语音转文字",
    help: "系统接口完成一次语音转文字任务时扣除的额度。",
    icon: IconWaveSine,
  },
  {
    key: "tts",
    label: "文字转语音",
    help: "系统接口完成一次文字转语音任务时扣除的额度。",
    icon: IconMicrophone,
  },
  {
    key: "voice_design",
    label: "音色设计",
    help: "系统接口完成一次音色设计任务时扣除的额度。",
    icon: IconSparkles,
  },
  {
    key: "voice_clone",
    label: "声音克隆",
    help: "系统接口完成一次声音克隆任务时扣除的额度。",
    icon: IconShieldCheck,
  },
]

const planPreviewTones = [
  {
    card: "border-[rgba(13,87,79,0.16)] bg-[rgba(240,248,247,0.82)]",
    badge: "bg-[rgba(13,87,79,0.10)] text-[oklch(0.32_0.06_185)]",
    block: "border-[rgba(13,87,79,0.14)] bg-white/60",
  },
  {
    card: "border-[rgba(35,99,150,0.16)] bg-[rgba(241,247,252,0.84)]",
    badge: "bg-[rgba(35,99,150,0.10)] text-[oklch(0.34_0.07_235)]",
    block: "border-[rgba(35,99,150,0.14)] bg-white/60",
  },
  {
    card: "border-[rgba(168,121,19,0.18)] bg-[rgba(255,249,233,0.82)]",
    badge: "bg-[rgba(168,121,19,0.12)] text-[oklch(0.42_0.08_85)]",
    block: "border-[rgba(168,121,19,0.16)] bg-white/62",
  },
  {
    card: "border-[rgba(89,95,101,0.16)] bg-[rgba(247,248,248,0.88)]",
    badge: "bg-[rgba(89,95,101,0.10)] text-[oklch(0.35_0.02_245)]",
    block: "border-[rgba(89,95,101,0.14)] bg-white/62",
  },
]

function normalizePlans(plans: BillingPlan[]): PlanDraft[] {
  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    quota: Number(plan.quota || 0),
    base_amount: String(plan.base_amount ?? "0.01"),
    enabled: Boolean(plan.enabled),
  }))
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

function mergeBasicInfo(config?: BasicInfoConfig): BasicInfoConfig {
  return {
    ...defaultBasicInfo,
    ...config,
  }
}

function mergeBillingConfig(config?: BillingConfig): BillingConfig {
  return {
    ...defaultBilling,
    ...config,
    usage_costs: {
      asr: 1,
      tts: 1,
      voice_design: 2,
      voice_clone: 3,
      ...(config?.usage_costs ?? {}),
    },
    checkin: {
      enabled: false,
      daily_quota: 10,
      ...(config?.checkin ?? {}),
    },
    client_secret: "",
  }
}

function mergeEmailConfig(config?: EmailAuthConfigState): EmailAuthConfigState {
  return {
    ...defaultEmail,
    ...config,
    smtp: {
      ...defaultEmail.smtp,
      ...(config?.smtp ?? {}),
    },
    api: {
      ...defaultEmail.api,
      ...(config?.api ?? {}),
    },
    sender: {
      ...defaultEmail.sender,
      ...(config?.sender ?? {}),
    },
    templates: {
      verification: {
        ...defaultEmailTemplates.verification,
        ...(config?.templates?.verification ?? {}),
      },
      two_factor: {
        ...defaultEmailTemplates.two_factor,
        ...(config?.templates?.two_factor ?? {}),
      },
    },
  }
}

export default function SystemSettingsPage() {
  const router = useRouter()
  const user = useCurrentUser()
  const [basicInfo, setBasicInfo] = useState<BasicInfoConfig>(defaultBasicInfo)
  const [mimo, setMimo] = useState<MimoConfig>(defaultMimo)
  const [email, setEmail] = useState<EmailAuthConfigState>(defaultEmail)
  const [smtpPassword, setSmtpPassword] = useState("")
  const [mailApiToken, setMailApiToken] = useState("")
  const [testEmailTo, setTestEmailTo] = useState("")
  const [billing, setBilling] = useState<BillingConfig>(defaultBilling)
  const [plans, setPlans] = useState<PlanDraft[]>([])
  const [settings, setSettings] = useState<SystemSetting[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const isAdmin = user?.role === "admin"

  const refresh = useCallback(async () => {
    try {
      const [
        basicInfoConfig,
        mimoConfig,
        emailConfig,
        billingConfig,
        systemSettings,
      ] =
        await Promise.all([
          api.adminBasicInfo(),
          api.adminMimoConfig(),
          api.adminEmailAuthConfig(),
          api.adminBillingConfig(),
          api.systemSettings(),
        ])
      setBasicInfo(mergeBasicInfo(basicInfoConfig))
      setMimo({ ...defaultMimo, ...mimoConfig, api_key: "" })
      setEmail(mergeEmailConfig(emailConfig))
      setSmtpPassword("")
      setMailApiToken("")
      setTestEmailTo(user?.email ?? "")
      setBilling(mergeBillingConfig(billingConfig))
      setPlans(normalizePlans(billingConfig.plans ?? []))
      setSettings(systemSettings)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "系统设置获取失败")
    }
  }, [user])

  useEffect(() => {
    if (user && !isAdmin) {
      router.replace("/dashboard")
    }
  }, [user, isAdmin, router])

  useEffect(() => {
    if (isAdmin) {
      let cancelled = false

      void (async () => {
        try {
          const [
            basicInfoConfig,
            mimoConfig,
            emailConfig,
            billingConfig,
            systemSettings,
          ] =
            await Promise.all([
              api.adminBasicInfo(),
              api.adminMimoConfig(),
              api.adminEmailAuthConfig(),
              api.adminBillingConfig(),
              api.systemSettings(),
            ])

          if (cancelled) {
            return
          }

          setBasicInfo(mergeBasicInfo(basicInfoConfig))
          setMimo({ ...defaultMimo, ...mimoConfig, api_key: "" })
          setEmail(mergeEmailConfig(emailConfig))
          setSmtpPassword("")
          setMailApiToken("")
          setTestEmailTo(user?.email ?? "")
          setBilling(mergeBillingConfig(billingConfig))
          setPlans(normalizePlans(billingConfig.plans ?? []))
          setSettings(systemSettings)
        } catch (error) {
          if (!cancelled) {
            toast.error(error instanceof Error ? error.message : "系统设置获取失败")
          }
        }
      })()

      return () => {
        cancelled = true
      }
    }
  }, [isAdmin, user])

  async function saveBasicInfo() {
    setSaving("basic")

    try {
      const saved = await api.saveAdminBasicInfo(basicInfo)
      setBasicInfo(mergeBasicInfo(saved))
      toast.success("基础信息已保存")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "基础信息保存失败")
    } finally {
      setSaving(null)
    }
  }

  async function saveMimo() {
    setSaving("mimo")

    try {
      const saved = await api.saveAdminMimoConfig(mimo)
      setMimo((current) => ({ ...current, ...saved, api_key: "" }))
      toast.success("全局 AI 配置已保存")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "全局 AI 配置保存失败")
    } finally {
      setSaving(null)
    }
  }

  async function saveEmail() {
    setSaving("email")

    try {
      const saved = await api.saveAdminEmailAuthConfig({
        enabled: email.enabled,
        verification_required: email.verification_required,
        ...emailDeliveryPayload(),
        verification_subject:
          email.templates?.verification?.subject ??
          defaultEmailTemplates.verification.subject,
        verification_body:
          email.templates?.verification?.body ??
          defaultEmailTemplates.verification.body,
        two_factor_subject:
          email.templates?.two_factor?.subject ??
          defaultEmailTemplates.two_factor.subject,
        two_factor_body:
          email.templates?.two_factor?.body ??
          defaultEmailTemplates.two_factor.body,
      })
      setEmail(mergeEmailConfig(saved))
      setSmtpPassword("")
      toast.success("认证配置已保存")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "认证配置保存失败")
    } finally {
      setSaving(null)
    }
  }

  async function testEmail() {
    setSaving("email-test")

    try {
      const result = await api.testAdminEmailAuthConfig({
        to: testEmailTo.trim() || user?.email || undefined,
        ...emailDeliveryPayload(),
      })
      toast.success(result.message || "测试邮件已发送")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "测试邮件发送失败")
    } finally {
      setSaving(null)
    }
  }

  function emailDeliveryPayload() {
    const payload: Record<string, string | number | undefined> = {
      driver: email.driver ?? "smtp",
      mail_from_address: email.sender?.address ?? "",
      mail_from_name: email.sender?.name ?? "",
    }

    if ((email.driver ?? "smtp") === "api") {
      payload.mail_api_provider = email.api?.provider ?? "generic_json"
      payload.mail_api_endpoint = email.api?.endpoint ?? ""
      if (mailApiToken) {
        payload.mail_api_token = mailApiToken
      }
      return payload
    }

    payload.smtp_host = email.smtp?.host ?? ""
    payload.smtp_port = email.smtp?.port ?? undefined
    payload.smtp_username = email.smtp?.username ?? ""
    if (smtpPassword) {
      payload.smtp_password = smtpPassword
    }
    payload.smtp_encryption = email.smtp?.encryption ?? "tls"

    return payload
  }

  async function saveBilling() {
    const invalidPlan = plans.find(
      (plan) =>
        !plan.id.trim() ||
        !plan.name.trim() ||
        Number(plan.quota) < 0 ||
        Number(plan.base_amount) < 0.01
    )
    if (invalidPlan) {
      toast.error("套餐配置无效")
      return
    }

    setSaving("billing")

    try {
      const saved = await api.saveAdminBillingConfig({
        enabled: billing.enabled,
        gateway_url: billing.gateway_url,
        client_id: billing.client_id,
        client_secret: billing.client_secret || undefined,
        credit_multiplier: billing.credit_multiplier,
        default_plan_id: billing.default_plan_id,
        notify_url: billing.notify_url,
        return_url: billing.return_url,
        usage_costs: billing.usage_costs,
        checkin: billing.checkin,
        plans: plans.map((plan) => ({
          id: plan.id.trim(),
          name: plan.name.trim(),
          quota: Number(plan.quota || 0),
          base_amount: Number(plan.base_amount || 0.01),
          enabled: Boolean(plan.enabled),
        })) as unknown as BillingConfig["plans"],
      })
      setBilling(mergeBillingConfig(saved))
      setPlans(normalizePlans(saved.plans ?? []))
      toast.success("计费配置已保存")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "计费配置保存失败")
    } finally {
      setSaving(null)
    }
  }

  function updatePlan(index: number, patch: Partial<PlanDraft>) {
    setPlans((current) =>
      current.map((plan, planIndex) =>
        planIndex === index ? { ...plan, ...patch } : plan
      )
    )
  }

  function addPlan() {
    setPlans((current) => [
      ...current,
      {
        id: `plan_${current.length + 1}`,
        name: "新套餐",
        quota: 100,
        base_amount: "10.00",
        enabled: true,
      },
    ])
  }

  function removePlan(index: number) {
    setPlans((current) => current.filter((_, planIndex) => planIndex !== index))
  }

  function updateEmailTemplate(
    template: EmailTemplateKey,
    patch: Partial<{ subject: string; body: string }>
  ) {
    setEmail((current) => ({
      ...current,
      templates: {
        verification: {
          ...defaultEmailTemplates.verification,
          ...(current.templates?.verification ?? {}),
        },
        two_factor: {
          ...defaultEmailTemplates.two_factor,
          ...(current.templates?.two_factor ?? {}),
        },
        [template]: {
          ...defaultEmailTemplates[template],
          ...(current.templates?.[template] ?? {}),
          ...patch,
        },
      },
    }))
  }

  const activePlans = useMemo(
    () => plans.filter((plan) => plan.enabled),
    [plans]
  )
  const defaultPlan = useMemo(
    () => plans.find((plan) => plan.id === billing.default_plan_id) ?? null,
    [plans, billing.default_plan_id]
  )
  const smtpConfigured = Boolean(
    email.smtp_configured ||
      email.smtp?.host ||
      email.smtp?.username ||
      email.smtp?.password_configured
  )
  const apiConfigured = Boolean(
    email.api_configured ||
      email.api?.endpoint ||
      email.api?.token_configured
  )
  const senderConfigured = Boolean(
    email.sender_configured || email.sender?.address || email.sender?.name
  )
  const isEmailApi = (email.driver ?? "smtp") === "api"
  const isResendProvider = email.api?.provider === "resend"
  const deliveryConfigured = isEmailApi ? apiConfigured : smtpConfigured
  const latestSetting = settings[0]?.updatedAt ?? "未记录"

  const sections: Array<{
    value: SettingsTab
    title: string
    badge: string
    icon: typeof IconBolt
  }> = [
    {
      value: "overview",
      title: "状态总览",
      badge: `${settings.length} 项`,
      icon: IconLayoutDashboard,
    },
    {
      value: "basic",
      title: "站点信息",
      badge: basicInfo.site_title ? "已设置" : "待配置",
      icon: IconWorldWww,
    },
    {
      value: "access",
      title: "全局 AI",
      badge: mimo.configured ? "已配置" : "待配置",
      icon: IconSparkles,
    },
    {
      value: "mail",
      title: "登录与邮件",
      badge: email.enabled ? "启用" : "停用",
      icon: IconMailCog,
    },
    {
      value: "billing",
      title: "套餐计费",
      badge: `${plans.length} 个`,
      icon: IconCreditCardPay,
    },
    {
      value: "records",
      title: "保存记录",
      badge: `${settings.length} 项`,
      icon: IconHistory,
    },
  ]

  return (
    <>
      <PageHeading
        title="系统配置"
        actions={
          <Button variant="outline" onClick={() => void refresh()}>
            <IconRefresh data-icon="inline-start" />
            刷新
          </Button>
        }
      />

      <div className="grid gap-4">
        <Tabs
          defaultValue="overview"
          orientation="vertical"
          className="flex flex-col gap-4 xl:grid xl:grid-cols-[220px_minmax(0,1fr)] xl:items-start"
        >
          <Card className="border-border/70 shadow-sm xl:sticky xl:top-4">
            <CardHeader className="text-center">
              <CardTitle>配置导航</CardTitle>
            </CardHeader>
            <CardContent>
              <TabsList
                variant="line"
                className="h-auto w-full flex-col items-stretch gap-2 bg-transparent p-0"
              >
                {sections.map((section) => {
                  const Icon = section.icon

                  return (
                    <TabsTrigger
                      key={section.value}
                      value={section.value}
                      className="relative h-auto justify-center rounded-xl border border-border/70 bg-muted/20 px-3 py-3 pr-20 text-center data-[state=active]:border-primary/30 data-[state=active]:bg-primary/5 after:hidden"
                    >
                      <div className="flex min-w-0 items-center justify-center gap-2">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-foreground">
                            {section.title}
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="absolute right-3 max-w-16 shrink-0 truncate"
                        title={section.badge}
                      >
                        {section.badge}
                      </Badge>
                    </TabsTrigger>
                  )
                })}
              </TabsList>
            </CardContent>
          </Card>

          <div className="grid gap-4">
            <TabsContent value="overview" className="m-0 space-y-4">
              <Card className="border-border/70 shadow-sm">
                <CardHeader>
                  <CardTitle>状态总览</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <SummaryTile
                      label="全局 AI"
                      value={mimo.configured ? "已配置" : "未配置"}
                      description={formatEndpoint(mimo.base_url)}
                    />
                    <SummaryTile
                      label="投递通道"
                      value={deliveryConfigured ? "已配置" : "待配置"}
                      description={isEmailApi ? "邮件 API" : "SMTP"}
                    />
                    <SummaryTile
                      label="启用套餐"
                      value={`${activePlans.length}`}
                      description={`共 ${plans.length} 个套餐`}
                    />
                    <SummaryTile
                      label="保存记录"
                      value={`${settings.length}`}
                      description={`最近更新时间 ${latestSetting}`}
                    />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card className="border-border/70 bg-muted/20 shadow-none">
                      <CardHeader>
                        <CardTitle>认证策略</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <StatusRow
                          label="邮箱登录"
                          value={email.enabled ? "启用" : "停用"}
                          tone={email.enabled ? "positive" : "neutral"}
                        />
                        <StatusRow
                          label="邮箱验证"
                          value={
                            email.verification_required ? "必需" : "不验证"
                          }
                          tone={
                            email.verification_required ? "positive" : "neutral"
                          }
                        />
                        <StatusRow
                          label="发件身份"
                          value={senderConfigured ? "已配置" : "待配置"}
                          tone={senderConfigured ? "positive" : "neutral"}
                        />
                      </CardContent>
                    </Card>

                    <Card className="border-border/70 bg-muted/20 shadow-none">
                      <CardHeader>
                        <CardTitle>计费策略</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <StatusRow
                          label="支付网关"
                          value={formatEndpoint(billing.gateway_url)}
                          tone={billing.gateway_url ? "positive" : "neutral"}
                        />
                        <StatusRow
                          label="默认套餐"
                          value={defaultPlan?.name ?? "未设置"}
                          tone={defaultPlan ? "positive" : "neutral"}
                        />
                        <StatusRow
                          label="积分倍率"
                          value={`${billing.credit_multiplier}x`}
                        />
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="basic" className="m-0 space-y-4">
              <Card className="border-border/70 shadow-sm">
                <CardHeader>
                  <CardAction>
                    <Badge variant={basicInfo.site_title ? "secondary" : "outline"}>
                      {basicInfo.site_title ? "已设置" : "未设置"}
                    </Badge>
                  </CardAction>
                  <CardTitle>站点信息</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <SummaryTile
                      label="系统名称"
                      value={basicInfo.system_name || "未设置"}
                      description={basicInfo.site_title || "站点标题未设置"}
                    />
                    <SummaryTile
                      label="站点地址"
                      value={formatEndpoint(basicInfo.app_url)}
                      description={basicInfo.app_url || "API 基地址"}
                    />
                    <SummaryTile
                      label="前端地址"
                      value={formatEndpoint(basicInfo.frontend_url)}
                      description={basicInfo.frontend_url || "前端入口"}
                    />
                    <SummaryTile
                      label="支持邮箱"
                      value={basicInfo.support_email || "未设置"}
                      description={basicInfo.icp_record || "ICP备案号未设置"}
                    />
                  </div>

                  <FieldGroup className="grid gap-5 md:grid-cols-2">
                    <Field>
                      <FieldHelpLabel
                        htmlFor="basic-system-name"
                        requirement="optional"
                        help="用于系统内部展示和邮件变量中的系统名称。"
                      >
                        系统名称
                      </FieldHelpLabel>
                      <Input
                        id="basic-system-name"
                        value={basicInfo.system_name ?? ""}
                        onChange={(event) =>
                          setBasicInfo((current) => ({
                            ...current,
                            system_name: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <FieldHelpLabel
                        htmlFor="basic-site-title"
                        requirement="optional"
                        help="站点页签、页面标题和公共展示标题。"
                      >
                        站点标题
                      </FieldHelpLabel>
                      <Input
                        id="basic-site-title"
                        value={basicInfo.site_title ?? ""}
                        onChange={(event) =>
                          setBasicInfo((current) => ({
                            ...current,
                            site_title: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <FieldHelpLabel
                        htmlFor="basic-site-subtitle"
                        requirement="optional"
                        help="用于首页或登录页的副标题展示。"
                      >
                        副标题
                      </FieldHelpLabel>
                      <Input
                        id="basic-site-subtitle"
                        value={basicInfo.site_subtitle ?? ""}
                        onChange={(event) =>
                          setBasicInfo((current) => ({
                            ...current,
                            site_subtitle: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <FieldHelpLabel
                        htmlFor="basic-app-url"
                        requirement="optional"
                        help="后端应用地址，用于回调、跳转和绝对链接。"
                      >
                        站点地址
                      </FieldHelpLabel>
                      <Input
                        id="basic-app-url"
                        type="url"
                        value={basicInfo.app_url ?? ""}
                        onChange={(event) =>
                          setBasicInfo((current) => ({
                            ...current,
                            app_url: event.target.value,
                          }))
                        }
                        placeholder="https://api.example.com"
                      />
                    </Field>
                    <Field>
                      <FieldHelpLabel
                        htmlFor="basic-frontend-url"
                        requirement="optional"
                        help="前端应用地址，用于跳转、邮件链接和 CORS 相关展示。"
                      >
                        前端地址
                      </FieldHelpLabel>
                      <Input
                        id="basic-frontend-url"
                        type="url"
                        value={basicInfo.frontend_url ?? ""}
                        onChange={(event) =>
                          setBasicInfo((current) => ({
                            ...current,
                            frontend_url: event.target.value,
                          }))
                        }
                        placeholder="https://app.example.com"
                      />
                    </Field>
                    <Field>
                      <FieldHelpLabel
                        htmlFor="basic-support-email"
                        requirement="optional"
                        help="站点对外支持邮箱，通常显示在页脚或联系入口。"
                      >
                        支持邮箱
                      </FieldHelpLabel>
                      <Input
                        id="basic-support-email"
                        type="email"
                        value={basicInfo.support_email ?? ""}
                        onChange={(event) =>
                          setBasicInfo((current) => ({
                            ...current,
                            support_email: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <FieldHelpLabel
                        htmlFor="basic-icp-record"
                        requirement="optional"
                        help="站点备案号，通常显示在页脚。"
                      >
                        ICP备案号
                      </FieldHelpLabel>
                      <Input
                        id="basic-icp-record"
                        value={basicInfo.icp_record ?? ""}
                        onChange={(event) =>
                          setBasicInfo((current) => ({
                            ...current,
                            icp_record: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field className="md:col-span-2">
                      <FieldHelpLabel
                        htmlFor="basic-footer-text"
                        requirement="optional"
                        help="页脚显示文本，可写版权、说明或联系信息。"
                      >
                        页脚文本
                      </FieldHelpLabel>
                      <Textarea
                        id="basic-footer-text"
                        value={basicInfo.footer_text ?? ""}
                        onChange={(event) =>
                          setBasicInfo((current) => ({
                            ...current,
                            footer_text: event.target.value,
                          }))
                        }
                        className="min-h-28"
                      />
                    </Field>
                  </FieldGroup>
                </CardContent>
                <CardFooter className="justify-end">
                  <SaveButton
                    pending={saving === "basic"}
                    onClick={() => void saveBasicInfo()}
                  />
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="access" className="m-0 space-y-4">
              <Card className="border-border/70 shadow-sm">
                <CardHeader>
                  <CardAction>
                    <Badge variant={mimo.configured ? "secondary" : "outline"}>
                      {mimo.configured ? "已配置" : "未配置"}
                    </Badge>
                  </CardAction>
                  <CardTitle>全局 AI 接入</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-3 md:grid-cols-3">
                    <SummaryTile
                      label="API 地址"
                      value={formatEndpoint(mimo.base_url)}
                      description="默认入口"
                    />
                    <SummaryTile
                      label="密钥状态"
                      value={mimo.configured ? "已配置" : "待配置"}
                      description={
                        mimo.configured ? "留空保留" : "首次需填写"
                      }
                    />
                    <SummaryTile
                      label="生效范围"
                      value="系统默认"
                      description="个人优先"
                    />
                  </div>

                  <FieldGroup className="grid gap-5 md:grid-cols-2">
                    <Field>
                      <FieldHelpLabel
                        htmlFor="system-mimo-url"
                        requirement="required"
                        help="默认 Mimo API 地址。"
                      >
                        API 地址
                      </FieldHelpLabel>
                      <Input
                        id="system-mimo-url"
                        value={mimo.base_url ?? ""}
                        onChange={(event) =>
                          setMimo((current) => ({
                            ...current,
                            base_url: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <FieldHelpLabel
                        htmlFor="system-mimo-key"
                        requirement={mimo.configured ? "optional" : "required"}
                        help="留空保留，填写则覆盖。"
                      >
                        API 密钥
                      </FieldHelpLabel>
                      <Input
                        id="system-mimo-key"
                        value={mimo.api_key ?? ""}
                        type="password"
                        onChange={(event) =>
                          setMimo((current) => ({
                            ...current,
                            api_key: event.target.value,
                          }))
                        }
                        placeholder={mimo.configured ? "保持当前密钥" : "输入密钥"}
                      />
                    </Field>
                  </FieldGroup>
                </CardContent>
                <CardFooter className="justify-end">
                  <SaveButton
                    pending={saving === "mimo"}
                    onClick={() => void saveMimo()}
                  />
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="mail" className="m-0 space-y-4">
              <Card className="border-border/70 shadow-sm">
                <CardHeader>
                  <CardAction>
                    <Badge variant={email.enabled ? "secondary" : "outline"}>
                      {email.enabled ? "启用" : "停用"}
                    </Badge>
                  </CardAction>
                  <CardTitle>登录与邮件</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-3 md:grid-cols-3">
                    <SummaryTile
                      label="邮箱登录"
                      value={email.enabled ? "启用" : "停用"}
                      description="控制邮箱注册与登录入口"
                    />
                    <SummaryTile
                      label="邮箱验证"
                      value={email.verification_required ? "必需" : "关闭"}
                      description="注册后是否要求验证"
                    />
                    <SummaryTile
                      label="投递通道"
                      value={deliveryConfigured ? "已配置" : "待配置"}
                      description={isEmailApi ? "邮件 API" : "SMTP"}
                    />
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                    <div className="grid gap-4">
                      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                        <Field orientation="horizontal">
                          <FieldContent>
                            <FieldTitle>邮箱登录</FieldTitle>
                          </FieldContent>
                          <Switch
                            checked={Boolean(email.enabled)}
                            onCheckedChange={(enabled) =>
                              setEmail((current) => ({ ...current, enabled }))
                            }
                          />
                        </Field>
                      </div>

                      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                        <Field orientation="horizontal">
                          <FieldContent>
                            <FieldTitle>验证邮箱</FieldTitle>
                          </FieldContent>
                          <Switch
                            checked={Boolean(email.verification_required)}
                            onCheckedChange={(verification_required) =>
                              setEmail((current) => ({
                                ...current,
                                verification_required,
                              }))
                            }
                          />
                        </Field>
                      </div>

                      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                        <StatusRow
                          label="发件身份"
                          value={senderConfigured ? "已配置" : "待配置"}
                          tone={senderConfigured ? "positive" : "neutral"}
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/70 p-4">
                      <FieldGroup className="grid gap-5 lg:grid-cols-2">
                        <Field>
                          <FieldHelpLabel
                            htmlFor="mail-driver"
                            requirement="optional"
                            help="SMTP 适合自有邮箱服务器；邮件 API 适合云服务器 SMTP 端口受限时使用。"
                          >
                            投递方式
                          </FieldHelpLabel>
                          <Select
                            value={email.driver ?? "smtp"}
                            onValueChange={(driver) =>
                              setEmail((current) => ({
                                ...current,
                                driver: driver === "api" ? "api" : "smtp",
                              }))
                            }
                          >
                            <SelectTrigger id="mail-driver" className="w-full">
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

                        {isEmailApi ? (
                          <>
                            <Field>
                              <FieldHelpLabel
                                htmlFor="mail-api-provider"
                                requirement="optional"
                                help="通用 JSON 会向接口 POST 标准字段；Resend 使用官方邮件接口格式。"
                              >
                                API 类型
                              </FieldHelpLabel>
                              <Select
                                value={email.api?.provider ?? "generic_json"}
                                onValueChange={(provider) =>
                                  setEmail((current) => ({
                                    ...current,
                                    api: {
                                      ...current.api,
                                      provider: provider as EmailApiProvider,
                                    },
                                  }))
                                }
                              >
                                <SelectTrigger
                                  id="mail-api-provider"
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
                            <FieldHelpLabel
                              htmlFor="mail-api-endpoint"
                              requirement="optional"
                              help={
                                  isResendProvider
                                    ? "Resend 默认地址为 https://api.resend.com/emails。"
                                    : "系统会以 Bearer Token 发送 JSON 请求。"
                                }
                              >
                                API 地址
                              </FieldHelpLabel>
                              <Input
                                id="mail-api-endpoint"
                                type="url"
                                value={email.api?.endpoint ?? ""}
                                placeholder={
                                  isResendProvider
                                    ? "https://api.resend.com/emails"
                                    : "https://mail.example.com/send"
                                }
                                onChange={(event) =>
                                  setEmail((current) => ({
                                    ...current,
                                    api: {
                                      ...current.api,
                                      endpoint: event.target.value,
                                    },
                                  }))
                                }
                              />
                            </Field>
                            <Field>
                              <FieldHelpLabel
                                htmlFor="mail-api-token"
                                requirement="optional"
                                help="留空保存时保留当前 API Token。"
                              >
                                API Token
                              </FieldHelpLabel>
                              <Input
                                id="mail-api-token"
                                type="password"
                                value={mailApiToken}
                                onChange={(event) =>
                                  setMailApiToken(event.target.value)
                                }
                                placeholder={
                                  email.api?.token_configured
                                    ? "保持当前 Token"
                                    : ""
                                }
                              />
                            </Field>
                          </>
                        ) : (
                          <>
                            <Field>
                              <FieldHelpLabel
                                htmlFor="smtp-host"
                                requirement="optional"
                                help="启用邮箱验证时需要可用 SMTP。"
                              >
                                SMTP 主机
                              </FieldHelpLabel>
                              <Input
                                id="smtp-host"
                                value={email.smtp?.host ?? ""}
                                onChange={(event) =>
                                  setEmail((current) => ({
                                    ...current,
                                    smtp: {
                                      ...current.smtp,
                                      host: event.target.value,
                                    },
                                  }))
                                }
                              />
                            </Field>
                            <Field>
                              <FieldHelpLabel
                                htmlFor="smtp-port"
                                requirement="optional"
                                help="常用端口为 465、587。"
                              >
                                SMTP 端口
                              </FieldHelpLabel>
                              <Input
                                id="smtp-port"
                                type="number"
                                value={email.smtp?.port ?? ""}
                                onChange={(event) =>
                                  setEmail((current) => ({
                                    ...current,
                                    smtp: {
                                      ...current.smtp,
                                      port: Number(event.target.value || 0),
                                    },
                                  }))
                                }
                              />
                            </Field>
                            <Field>
                              <FieldHelpLabel
                                htmlFor="smtp-username"
                                requirement="optional"
                                help="用于 SMTP 身份验证。"
                              >
                                SMTP 用户名
                              </FieldHelpLabel>
                              <Input
                                id="smtp-username"
                                value={email.smtp?.username ?? ""}
                                onChange={(event) =>
                                  setEmail((current) => ({
                                    ...current,
                                    smtp: {
                                      ...current.smtp,
                                      username: event.target.value,
                                    },
                                  }))
                                }
                              />
                            </Field>
                            <Field>
                              <FieldHelpLabel
                                htmlFor="smtp-password"
                                requirement="optional"
                                help="留空保存时保留当前 SMTP 密码。"
                              >
                                SMTP 密码
                              </FieldHelpLabel>
                              <Input
                                id="smtp-password"
                                type="password"
                                value={smtpPassword}
                                onChange={(event) =>
                                  setSmtpPassword(event.target.value)
                                }
                                placeholder={
                                  email.smtp?.password_configured
                                    ? "保持当前密码"
                                    : ""
                                }
                              />
                            </Field>
                            <Field>
                              <FieldHelpLabel
                                htmlFor="smtp-encryption"
                                requirement="optional"
                                help="与邮箱服务商要求保持一致。"
                              >
                                加密方式
                              </FieldHelpLabel>
                              <Select
                                value={email.smtp?.encryption ?? "tls"}
                                onValueChange={(encryption) =>
                                  setEmail((current) => ({
                                    ...current,
                                    smtp: { ...current.smtp, encryption },
                                  }))
                                }
                              >
                                <SelectTrigger
                                  id="smtp-encryption"
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
                          <FieldHelpLabel
                            htmlFor="mail-from-address"
                            requirement="optional"
                            help={
                              isResendProvider
                                ? "必须使用 Resend 已验证域名邮箱。"
                                : "用户收到邮件时显示的发件邮箱。"
                            }
                          >
                            发件邮箱
                          </FieldHelpLabel>
                          <Input
                            id="mail-from-address"
                            value={email.sender?.address ?? ""}
                            onChange={(event) =>
                              setEmail((current) => ({
                                ...current,
                                sender: {
                                  ...current.sender,
                                  address: event.target.value,
                                },
                              }))
                            }
                          />
                        </Field>
                        <Field>
                          <FieldHelpLabel
                            htmlFor="mail-from-name"
                            requirement="optional"
                            help={
                              isResendProvider
                                ? "可留空；留空时只使用发件邮箱。"
                                : "用户收到邮件时显示的发件名称。"
                            }
                          >
                            发件名称
                          </FieldHelpLabel>
                          <Input
                            id="mail-from-name"
                            value={email.sender?.name ?? ""}
                            onChange={(event) =>
                              setEmail((current) => ({
                                ...current,
                                sender: {
                                  ...current.sender,
                                  name: event.target.value,
                                },
                              }))
                            }
                          />
                        </Field>
                      </FieldGroup>
                      <div className="mt-5 flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                          <Field className="min-w-0 flex-1">
                            <FieldHelpLabel
                              htmlFor="smtp-test-to"
                              requirement="optional"
                              help="留空时发送到当前管理员邮箱。测试会使用当前表单内容，不需要先保存。"
                            >
                              测试收件邮箱
                            </FieldHelpLabel>
                            <Input
                              id="smtp-test-to"
                              type="email"
                              value={testEmailTo}
                              onChange={(event) =>
                                setTestEmailTo(event.target.value)
                              }
                              placeholder={user?.email ?? "admin@example.com"}
                            />
                          </Field>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void testEmail()}
                            disabled={saving === "email-test"}
                          >
                            {saving === "email-test" ? (
                              <IconLoader2 data-icon="inline-start" />
                            ) : (
                              <IconMailShare data-icon="inline-start" />
                            )}
                            测试发送
                          </Button>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            onClick={() => void saveEmail()}
                            disabled={saving === "email"}
                          >
                            {saving === "email" ? (
                              <IconLoader2 data-icon="inline-start" />
                            ) : (
                              <IconDeviceFloppy data-icon="inline-start" />
                            )}
                            保存邮箱配置
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <section className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <FieldTitle>邮件模板</FieldTitle>
                      </div>
                    </div>

                    <Tabs defaultValue="verification" className="space-y-4">
                      <TabsList variant="line" className="w-full justify-start">
                        <TabsTrigger value="verification">邮箱验证</TabsTrigger>
                        <TabsTrigger value="two_factor">两步验证</TabsTrigger>
                      </TabsList>

                      <TabsContent value="verification" className="m-0">
                        <EmailTemplateEditor
                          idPrefix="verification-template"
                          subject={
                            email.templates?.verification?.subject ??
                            defaultEmailTemplates.verification.subject
                          }
                          body={
                            email.templates?.verification?.body ??
                            defaultEmailTemplates.verification.body
                          }
                          variables={verificationVariables}
                          onChange={(patch) =>
                            updateEmailTemplate("verification", patch)
                          }
                          onReset={() =>
                            updateEmailTemplate(
                              "verification",
                              defaultEmailTemplates.verification
                            )
                          }
                        />
                      </TabsContent>

                      <TabsContent value="two_factor" className="m-0">
                        <EmailTemplateEditor
                          idPrefix="two-factor-template"
                          subject={
                            email.templates?.two_factor?.subject ??
                            defaultEmailTemplates.two_factor.subject
                          }
                          body={
                            email.templates?.two_factor?.body ??
                            defaultEmailTemplates.two_factor.body
                          }
                          variables={twoFactorVariables}
                          onChange={(patch) =>
                            updateEmailTemplate("two_factor", patch)
                          }
                          onReset={() =>
                            updateEmailTemplate(
                              "two_factor",
                              defaultEmailTemplates.two_factor
                            )
                          }
                        />
                      </TabsContent>
                    </Tabs>
                  </section>
                </CardContent>
                <CardFooter className="justify-end">
                  <SaveButton
                    pending={saving === "email"}
                    onClick={() => void saveEmail()}
                  />
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="billing" className="m-0 space-y-4">
              <Card className="border-border/70 shadow-sm">
                <CardHeader>
                  <CardAction>
                    <Badge
                      variant={billing.configured ? "secondary" : "outline"}
                    >
                      {billing.configured ? "已配置" : "未配置"}
                    </Badge>
                  </CardAction>
                  <CardTitle>套餐计费</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <SummaryTile
                      label="支付网关"
                      value={formatEndpoint(billing.gateway_url)}
                      description={billing.provider_name}
                    />
                    <SummaryTile
                      label="积分倍率"
                      value={`${billing.credit_multiplier}x`}
                      description="基础积分乘数"
                    />
                    <SummaryTile
                      label="默认套餐"
                      value={defaultPlan?.name ?? "未设置"}
                      description={billing.default_plan_id ?? "未指定"}
                    />
                    <SummaryTile
                      label="启用套餐"
                      value={`${activePlans.length}`}
                      description={`共 ${plans.length} 个套餐`}
                    />
                    <SummaryTile
                      label="签到"
                      value={billing.checkin?.enabled ? "启用" : "停用"}
                      description={`${billing.checkin?.daily_quota ?? 0} 额度/日`}
                    />
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle>启用计费</FieldTitle>
                      </FieldContent>
                      <Switch
                        checked={Boolean(billing.enabled)}
                        onCheckedChange={(enabled) =>
                          setBilling((current) => ({ ...current, enabled }))
                        }
                      />
                    </Field>
                  </div>

                  <FieldGroup className="grid gap-5 md:grid-cols-2">
                    <Field>
                      <FieldHelpLabel
                        htmlFor="credit-gateway"
                        requirement="required"
                        help="LinuxDo Credit 易支付兼容网关地址。"
                      >
                        网关地址
                      </FieldHelpLabel>
                      <Input
                        id="credit-gateway"
                        value={billing.gateway_url ?? ""}
                        onChange={(event) =>
                          setBilling((current) => ({
                            ...current,
                            gateway_url: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <FieldHelpLabel
                        htmlFor="credit-multiplier"
                        requirement="required"
                        help="支付积分 = 基础积分 x 积分倍率。"
                      >
                        积分倍率
                      </FieldHelpLabel>
                      <Input
                        id="credit-multiplier"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={billing.credit_multiplier ?? 1}
                        onChange={(event) =>
                          setBilling((current) => ({
                            ...current,
                            credit_multiplier: Number(event.target.value || 1),
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <FieldHelpLabel
                        htmlFor="credit-client-id"
                        requirement="optional"
                        help="启用计费后用于支付请求签名。"
                      >
                        商户 ID
                      </FieldHelpLabel>
                      <Input
                        id="credit-client-id"
                        value={billing.client_id ?? ""}
                        onChange={(event) =>
                          setBilling((current) => ({
                            ...current,
                            client_id: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <FieldHelpLabel
                        htmlFor="credit-client-secret"
                        requirement="optional"
                        help="留空保存时保留当前商户密钥。"
                      >
                        商户密钥
                      </FieldHelpLabel>
                      <Input
                        id="credit-client-secret"
                        type="password"
                        value={billing.client_secret ?? ""}
                        onChange={(event) =>
                          setBilling((current) => ({
                            ...current,
                            client_secret: event.target.value,
                          }))
                        }
                        placeholder={
                          billing.client_secret_configured ? "保持当前密钥" : ""
                        }
                      />
                    </Field>
                    <Field>
                      <FieldHelpLabel
                        htmlFor="default-plan"
                        requirement="required"
                        help="新注册用户和首次 LinuxDo 登录用户会分配该套餐。"
                      >
                        默认套餐
                      </FieldHelpLabel>
                      <Select
                        value={billing.default_plan_id ?? ""}
                        onValueChange={(default_plan_id) =>
                          setBilling((current) => ({ ...current, default_plan_id }))
                        }
                      >
                        <SelectTrigger id="default-plan" className="w-full">
                          <SelectValue placeholder="选择套餐" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {plans.map((plan) => (
                              <SelectItem key={plan.id} value={plan.id}>
                                {plan.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldHelpLabel
                        htmlFor="credit-notify"
                        requirement="optional"
                        help="留空时使用系统默认异步通知地址。"
                      >
                        Notify URL
                      </FieldHelpLabel>
                      <Input
                        id="credit-notify"
                        value={billing.notify_url ?? ""}
                        onChange={(event) =>
                          setBilling((current) => ({
                            ...current,
                            notify_url: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <FieldHelpLabel
                        htmlFor="credit-return"
                        requirement="optional"
                        help="支付完成后浏览器返回地址。"
                      >
                        Return URL
                      </FieldHelpLabel>
                      <Input
                        id="credit-return"
                        value={billing.return_url ?? ""}
                        onChange={(event) =>
                          setBilling((current) => ({
                            ...current,
                            return_url: event.target.value,
                          }))
                        }
                      />
                    </Field>
                  </FieldGroup>

                  <Separator />

                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <Card className="border-border/70 bg-muted/20 shadow-none">
                      <CardHeader>
                        <CardTitle>接口消耗</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <FieldGroup className="grid gap-4 md:grid-cols-2">
                          {usageCostItems.map((item) => {
                            const Icon = item.icon

                            return (
                              <Field key={item.key}>
                                <FieldHelpLabel
                                  htmlFor={`usage-cost-${item.key}`}
                                  requirement="required"
                                  help={item.help}
                                >
                                  <span className="inline-flex items-center gap-2">
                                    <Icon className="size-4 text-primary" />
                                    {item.label}
                                  </span>
                                </FieldHelpLabel>
                                <Input
                                  id={`usage-cost-${item.key}`}
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={billing.usage_costs?.[item.key] ?? 0}
                                  onChange={(event) =>
                                    setBilling((current) => ({
                                      ...current,
                                      usage_costs: {
                                        asr: 1,
                                        tts: 1,
                                        voice_design: 2,
                                        voice_clone: 3,
                                        ...(current.usage_costs ?? {}),
                                        [item.key]: Math.max(
                                          0,
                                          Number(event.target.value || 0)
                                        ),
                                      },
                                    }))
                                  }
                                />
                              </Field>
                            )
                          })}
                        </FieldGroup>
                      </CardContent>
                    </Card>

                    <Card className="border-border/70 bg-muted/20 shadow-none">
                      <CardHeader>
                        <CardTitle>签到</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <Field orientation="horizontal">
                          <FieldContent>
                            <FieldTitle className="inline-flex items-center gap-2">
                              <IconGift className="size-4 text-primary" />
                              启用签到
                            </FieldTitle>
                          </FieldContent>
                          <Switch
                            checked={Boolean(billing.checkin?.enabled)}
                            onCheckedChange={(enabled) =>
                              setBilling((current) => ({
                                ...current,
                                checkin: {
                                  ...(current.checkin ?? {
                                    enabled: false,
                                    daily_quota: 10,
                                  }),
                                  enabled,
                                },
                              }))
                            }
                          />
                        </Field>
                        <Field>
                          <FieldHelpLabel
                            htmlFor="checkin-daily-quota"
                            requirement="required"
                            help="签到开启后，用户每天可领取的额度。关闭后用户端不显示签到入口。"
                          >
                            每日额度
                          </FieldHelpLabel>
                          <Input
                            id="checkin-daily-quota"
                            type="number"
                            min="1"
                            step="1"
                            value={billing.checkin?.daily_quota ?? 0}
                            onChange={(event) =>
                              setBilling((current) => ({
                                ...current,
                                checkin: {
                                  ...(current.checkin ?? {
                                    enabled: false,
                                    daily_quota: 10,
                                  }),
                                  daily_quota: Math.max(
                                    1,
                                    Number(event.target.value || 1)
                                  ),
                                },
                              }))
                            }
                          />
                        </Field>
                      </CardContent>
                    </Card>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <FieldTitle>套餐管理</FieldTitle>
                      </div>
                      <Button type="button" variant="outline" onClick={addPlan}>
                        <IconPlus data-icon="inline-start" />
                        新增套餐
                      </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {plans.map((plan, index) => (
                        <PlanPreviewCard
                          key={plan.id}
                          plan={plan}
                          isDefault={plan.id === billing.default_plan_id}
                          tone={planPreviewTones[index % planPreviewTones.length]}
                        />
                      ))}
                      {plans.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                          暂无套餐，请先新增。
                        </div>
                      )}
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-border/70">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>启用</TableHead>
                            <TableHead>套餐 ID</TableHead>
                            <TableHead>名称</TableHead>
                            <TableHead>额度</TableHead>
                            <TableHead>基础积分</TableHead>
                            <TableHead className="text-right">操作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {plans.map((plan, index) => (
                            <TableRow key={`${plan.id}-${index}`}>
                              <TableCell>
                                <Checkbox
                                  checked={plan.enabled}
                                  onCheckedChange={(enabled) =>
                                    updatePlan(index, {
                                      enabled: Boolean(enabled),
                                    })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={plan.id}
                                  onChange={(event) =>
                                    updatePlan(index, { id: event.target.value })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={plan.name}
                                  onChange={(event) =>
                                    updatePlan(index, { name: event.target.value })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  value={plan.quota}
                                  onChange={(event) =>
                                    updatePlan(index, {
                                      quota: Number(event.target.value || 0),
                                    })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  value={plan.base_amount}
                                  onChange={(event) =>
                                    updatePlan(index, {
                                      base_amount: event.target.value,
                                    })
                                  }
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => removePlan(index)}
                                >
                                  <IconTrash />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="justify-end">
                  <SaveButton
                    pending={saving === "billing"}
                    onClick={() => void saveBilling()}
                  />
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="records" className="m-0 space-y-4">
              <Card className="border-border/70 shadow-sm">
                <CardHeader>
                  <CardAction>
                    <Badge variant="outline">{settings.length} 项</Badge>
                  </CardAction>
                  <CardTitle>保存记录</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-2xl border border-border/70">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>键</TableHead>
                          <TableHead>值</TableHead>
                          <TableHead>更新时间</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {settings.map((setting) => (
                          <TableRow key={setting.key}>
                            <TableCell className="font-medium">
                              {setting.key}
                            </TableCell>
                            <TableCell
                              className="max-w-[420px] truncate"
                              title={setting.value}
                            >
                              {setting.value}
                            </TableCell>
                            <TableCell>{setting.updatedAt}</TableCell>
                          </TableRow>
                        ))}
                        {settings.length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={3}
                              className="py-8 text-center text-muted-foreground"
                            >
                              暂无保存记录
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>

        </Tabs>
      </div>
    </>
  )
}

function SummaryTile({
  label,
  value,
  description,
}: {
  label: string
  value: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background px-4 py-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div
        className="mt-2 truncate text-2xl font-semibold tracking-normal"
        title={value}
      >
        {value}
      </div>
      <div className="mt-3 text-sm text-muted-foreground">{description}</div>
    </div>
  )
}

const statusRowIcons: Record<string, typeof IconBolt> = {
  "全局 AI": IconSparkles,
  "API 地址": IconApi,
  接口域名: IconWorldWww,
  邮箱登录: IconMailCheck,
  邮箱验证: IconShieldCheck,
  发件身份: IconMailForward,
  投递通道: IconMailCog,
  SMTP: IconServerCog,
  "邮件 API": IconApi,
  计费: IconReceipt2,
  支付网关: IconCreditCardPay,
  默认套餐: IconPackage,
  积分倍率: IconPercentage,
  保存记录: IconHistory,
}

function StatusRow({
  label,
  value,
}: {
  label: string
  value: string
  tone?: "neutral" | "positive"
}) {
  const Icon = statusRowIcons[label] ?? IconBolt

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
        <span>{label}</span>
      </div>
      <div className="max-w-[55%] truncate text-sm font-medium" title={value}>
        {value}
      </div>
    </div>
  )
}

function PlanPreviewCard({
  plan,
  isDefault,
  tone,
}: {
  plan: PlanDraft
  isDefault: boolean
  tone: (typeof planPreviewTones)[number]
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        tone.card
      )}
    >
      <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-medium" title={plan.name}>
              {plan.name}
            </div>
          </div>
        <div className="flex flex-col items-end gap-2">
          <Badge
            variant="outline"
            className={cn(
              "border-transparent",
              plan.enabled ? tone.badge : "bg-muted/70 text-muted-foreground"
            )}
          >
            {plan.enabled ? "启用" : "停用"}
          </Badge>
          {isDefault && <Badge variant="outline">默认</Badge>}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className={cn("rounded-xl border px-3 py-2", tone.block)}>
          <div className="text-muted-foreground">额度</div>
          <div className="mt-1 truncate font-medium" title={String(plan.quota)}>
            {plan.quota}
          </div>
        </div>
        <div className={cn("rounded-xl border px-3 py-2", tone.block)}>
          <div className="text-muted-foreground">基础积分</div>
          <div className="mt-1 truncate font-medium" title={plan.base_amount}>
            {plan.base_amount}
          </div>
        </div>
      </div>
    </div>
  )
}

function EmailTemplateEditor({
  idPrefix,
  subject,
  body,
  variables,
  onChange,
  onReset,
}: {
  idPrefix: string
  subject: string
  body: string
  variables: string[]
  onChange: (patch: Partial<{ subject: string; body: string }>) => void
  onReset: () => void
}) {
  function appendVariable(variable: string) {
    onChange({
      body: `${body}${body.endsWith("\n") || body.length === 0 ? "" : "\n"}${variable}`,
    })
  }

  return (
    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
      <FieldGroup className="grid gap-5">
        <Field>
          <FieldHelpLabel
            htmlFor={`${idPrefix}-subject`}
            requirement="required"
            help="邮件标题，留空保存时会使用默认标题。"
          >
            主题
          </FieldHelpLabel>
          <Input
            id={`${idPrefix}-subject`}
            value={subject}
            onChange={(event) => onChange({ subject: event.target.value })}
          />
        </Field>

        <Field>
          <FieldHelpLabel
            htmlFor={`${idPrefix}-body`}
            requirement="required"
            help="邮件正文，支持下方变量占位符。"
          >
            正文
          </FieldHelpLabel>
          <Textarea
            id={`${idPrefix}-body`}
            value={body}
            onChange={(event) => onChange({ body: event.target.value })}
            className="min-h-44 font-mono text-sm"
          />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {variables.map((variable) => (
              <Tooltip key={variable}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => appendVariable(variable)}
                    aria-label={`${variable}：${emailVariableHelp[variable] ?? "模板变量"}`}
                  >
                    {variable}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {variable}：{emailVariableHelp[variable] ?? "模板变量"}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onReset}>
            还原默认
          </Button>
        </div>
      </FieldGroup>
    </div>
  )
}

function SaveButton({
  pending,
  onClick,
}: {
  pending: boolean
  onClick: () => void
}) {
  return (
    <Button onClick={onClick} disabled={pending}>
      {pending ? (
        <IconLoader2 data-icon="inline-start" />
      ) : (
        <IconDeviceFloppy data-icon="inline-start" />
      )}
      保存
    </Button>
  )
}
