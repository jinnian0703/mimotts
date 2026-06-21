"use client"

import { type ComponentType, useEffect, useState } from "react"
import {
  IconCircleCheck,
  IconCreditCard,
  IconGauge,
  IconGift,
  IconHistory,
  IconLoader2,
  IconRefresh,
  IconWallet,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { PageHeading } from "@/components/page-heading"
import { api } from "@/lib/api"
import type { BillingConfig, BillingPlan, QuotaRecord, QuotaSummary } from "@/lib/types"
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
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const emptyBilling: BillingConfig = {
  enabled: false,
  provider: "linuxdo_credit",
  provider_name: "LinuxDo Credit",
  configured: false,
  credit_multiplier: 1,
  usage_costs: {
    asr: 1,
    tts: 1,
    voice_design: 2,
    voice_clone: 3,
  },
  checkin: {
    enabled: false,
    daily_quota: 0,
  },
  plans: [],
}

const emptyQuota: QuotaSummary = {
  balance: 0,
  usage_costs: {
    asr: 1,
    tts: 1,
    voice_design: 2,
    voice_clone: 3,
  },
  checkin: {
    enabled: false,
    daily_quota: 0,
    checked_today: false,
  },
  records: [],
}

export default function BillingPage() {
  const [config, setConfig] = useState<BillingConfig>(emptyBilling)
  const [quota, setQuota] = useState<QuotaSummary>(emptyQuota)
  const [loading, setLoading] = useState(false)
  const [checkinPending, setCheckinPending] = useState(false)
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null)

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    setLoading(true)

    try {
      const [billingConfig, quotaSummary] = await Promise.all([
        api.billingConfig(),
        api.quotaSummary(),
      ])

      setConfig({ ...emptyBilling, ...billingConfig })
      setQuota({ ...emptyQuota, ...quotaSummary })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "计费配置获取失败")
    } finally {
      setLoading(false)
    }
  }

  async function checkIn() {
    setCheckinPending(true)

    try {
      const result = await api.checkIn()
      setQuota({ ...emptyQuota, ...result.quota })
      toast.success(result.message)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "签到失败")
    } finally {
      setCheckinPending(false)
    }
  }

  async function checkout(plan: BillingPlan) {
    setCheckoutPlan(plan.id)

    try {
      const result = await api.createBillingCheckout(plan.id)
      submitCheckout(result.checkout_url, result.checkout_params)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "支付创建失败")
      setCheckoutPlan(null)
    }
  }

  const enabledPlans = config.plans.filter((plan) => plan.enabled)

  return (
    <>
      <PageHeading
        title="套餐计费"
        actions={
          <Button variant="outline" onClick={refresh} disabled={loading}>
            <IconRefresh data-icon="inline-start" />
            刷新
          </Button>
        }
      />

      <BillingOverview config={config} quota={quota} />

      {quota.checkin.enabled && (
        <Card className="border-border/70 shadow-sm">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <IconGift />
              </div>
              <div className="min-w-0">
                <div className="font-medium">每日签到</div>
                <div className="text-sm text-muted-foreground">
                  {quota.checkin.checked_today
                    ? "今日已领取"
                    : `领取 ${quota.checkin.daily_quota} 额度`}
                </div>
              </div>
            </div>
            <Button
              onClick={() => void checkIn()}
              disabled={checkinPending || Boolean(quota.checkin.checked_today)}
            >
              {checkinPending ? (
                <IconLoader2 data-icon="inline-start" />
              ) : (
                <IconGift data-icon="inline-start" />
              )}
              {quota.checkin.checked_today ? "已签到" : "签到"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>接口消耗</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <UsageCost label="语音识别" value={quota.usage_costs.asr} />
            <UsageCost label="语音合成" value={quota.usage_costs.tts} />
            <UsageCost label="音色设计" value={quota.usage_costs.voice_design} />
            <UsageCost label="声音克隆" value={quota.usage_costs.voice_clone} />
          </div>
        </CardContent>
      </Card>

      {enabledPlans.length === 0 ? (
        <Empty className="border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconCreditCard />
            </EmptyMedia>
            <EmptyTitle>暂无套餐</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {enabledPlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              pending={checkoutPlan === plan.id}
              disabled={!config.enabled || !config.configured}
              onCheckout={() => checkout(plan)}
            />
          ))}
        </div>
      )}

      <Card className="border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconHistory />
            额度记录
          </CardTitle>
        </CardHeader>
        <CardContent>
          {quota.records.length === 0 ? (
            <Empty className="border bg-background">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconWallet />
                </EmptyMedia>
                <EmptyTitle>暂无额度记录</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>类型</TableHead>
                    <TableHead>模块</TableHead>
                    <TableHead>变动</TableHead>
                    <TableHead>余额</TableHead>
                    <TableHead>时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quota.records.map((record) => (
                    <QuotaRecordRow key={record.id} record={record} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function UsageCost({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
      <span className="truncate text-sm text-muted-foreground" title={label}>
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function BillingOverview({
  config,
  quota,
}: {
  config: BillingConfig
  quota: QuotaSummary
}) {
  const multiplier = config.credit_multiplier || 1

  return (
    <Card className="border-border/70 py-0 shadow-sm">
      <CardContent className="p-0">
        <div className="grid lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.8fr)]">
          <div className="flex min-h-36 flex-col justify-between gap-5 border-b border-border/70 bg-primary/5 p-5 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <IconWallet className="size-4" />
                可用额度
              </div>
              <Badge variant="secondary">余额</Badge>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <div
                  className="truncate font-heading text-5xl font-semibold tracking-normal"
                  title={String(quota.balance)}
                >
                  {quota.balance}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  当前可消耗额度
                </div>
              </div>
              {quota.checkin.enabled && (
                <Badge variant={quota.checkin.checked_today ? "secondary" : "outline"}>
                  {quota.checkin.checked_today ? "今日已签到" : `签到 +${quota.checkin.daily_quota}`}
                </Badge>
              )}
            </div>
          </div>

          <div className="grid sm:grid-cols-3">
            <OverviewMetric
              icon={IconCircleCheck}
              label="计费状态"
              value={config.enabled ? "已启用" : "未启用"}
              detail={config.enabled ? "套餐购买可用" : "套餐购买关闭"}
            />
            <OverviewMetric
              icon={IconCreditCard}
              label="支付渠道"
              value={config.provider_name}
              detail={config.configured ? "支付已配置" : "支付未配置"}
            />
            <OverviewMetric
              icon={IconGauge}
              label="积分倍率"
              value={`${multiplier} 倍`}
              detail="基础积分换算"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function OverviewMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="flex min-h-36 flex-col justify-between gap-5 border-b border-border/70 p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" />
        <span>{label}</span>
      </div>
      <div className="min-w-0">
        <div className="truncate font-heading text-2xl font-semibold tracking-normal" title={value}>
          {value}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  )
}

function QuotaRecordRow({ record }: { record: QuotaRecord }) {
  const amount = record.amount > 0 ? `+${record.amount}` : String(record.amount)

  return (
    <TableRow>
      <TableCell>
        <Badge variant={record.amount < 0 ? "outline" : "secondary"}>
          {record.typeLabel}
        </Badge>
      </TableCell>
      <TableCell
        className="max-w-48 truncate"
        title={record.moduleLabel ?? record.description ?? "-"}
      >
        {record.moduleLabel ?? record.description ?? "-"}
      </TableCell>
      <TableCell className="font-medium">{amount}</TableCell>
      <TableCell>{record.balanceAfter}</TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {record.createdAt ?? "-"}
      </TableCell>
    </TableRow>
  )
}

function PlanCard({
  plan,
  pending,
  disabled,
  onCheckout,
}: {
  plan: BillingPlan
  pending: boolean
  disabled: boolean
  onCheckout: () => void
}) {
  return (
    <Card
      size="sm"
      className="border-border/70 bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <CardHeader className="gap-1">
        <CardTitle className="truncate" title={plan.name}>
          {plan.name}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          <PlanMetric label="额度" value={plan.quota} />
          <PlanMetric label="基础积分" value={plan.base_amount} />
        </div>
      </CardContent>

      <CardFooter className="justify-end">
        <Button
          size="sm"
          className="w-full"
          onClick={onCheckout}
          disabled={pending || disabled}
        >
          {pending ? (
            <IconLoader2 data-icon="inline-start" />
          ) : (
            <IconCreditCard data-icon="inline-start" />
          )}
          支付
        </Button>
      </CardFooter>
    </Card>
  )
}

function PlanMetric({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background px-4 py-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 truncate text-2xl font-semibold tracking-normal" title={String(value)}>
        {value}
      </div>
    </div>
  )
}

function submitCheckout(
  action: string,
  params: Record<string, string | number | boolean>
) {
  const form = document.createElement("form")
  form.method = "POST"
  form.action = action
  form.style.display = "none"

  Object.entries(params).forEach(([name, value]) => {
    const input = document.createElement("input")
    input.name = name
    input.value = String(value)
    form.appendChild(input)
  })

  document.body.appendChild(form)
  form.submit()
}
