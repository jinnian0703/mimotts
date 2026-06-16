"use client"

import Link from "next/link"
import {
  IconArrowRight,
  IconBrandOauth,
  IconClipboardList,
  IconCreditCard,
  IconGauge,
  IconSettings,
  IconWaveSine,
} from "@tabler/icons-react"

import { useCurrentUser } from "@/components/auth-gate"
import { Button } from "@/components/ui/button"

const modules = ["语音转文字", "文字转语音", "音色设计", "声音克隆"]

const capabilities = [
  {
    title: "音频任务",
    text: "统一处理识别、合成、音色与克隆任务。",
    icon: IconWaveSine,
  },
  {
    title: "账户接入",
    text: "支持邮箱账户与 LinuxDo Connect。",
    icon: IconBrandOauth,
  },
  {
    title: "套餐计费",
    text: "支持套餐、额度与积分倍率配置。",
    icon: IconCreditCard,
  },
  {
    title: "系统管理",
    text: "管理员维护用户、公告与系统配置。",
    icon: IconSettings,
  },
]

export default function HomePage() {
  const user = useCurrentUser()
  const entryHref = user ? "/dashboard" : "/login"

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-6">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <IconClipboardList className="size-5" />
          </span>
          <span className="font-heading text-xl font-semibold">Mimo</span>
        </Link>
        <Button asChild variant="outline">
          <Link href={entryHref}>
            {user ? "进入仪表盘" : "登录"}
            <IconArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </header>

      <section className="mx-auto grid min-h-[calc(100dvh-96px)] w-full max-w-6xl items-center gap-12 px-5 pb-14 pt-8 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className="max-w-3xl">
          <div className="space-y-6">
            <p className="text-sm font-medium text-primary">小米 MimoTTS 接入工具</p>
            <h1 className="max-w-3xl font-heading text-5xl font-semibold tracking-normal text-foreground sm:text-6xl lg:text-7xl">
              音频任务管理系统
            </h1>
            <p className="max-w-2xl text-base leading-8 text-muted-foreground">
              集中管理语音识别、语音合成、音色设计、声音克隆、账户接入与套餐计费。
            </p>
          </div>

          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={entryHref}>
                {user ? "进入仪表盘" : "开始使用"}
                <IconArrowRight data-icon="inline-end" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/login">账户登录</Link>
            </Button>
          </div>

          <div className="mt-14 grid max-w-2xl grid-cols-1 gap-px border-y border-border bg-border sm:grid-cols-2">
            {modules.map((module) => (
              <div
                key={module}
                className="bg-background py-4 text-sm font-medium sm:px-4 sm:first:pl-0"
              >
                {module}
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <div className="text-sm text-muted-foreground">系统入口</div>
              <div className="mt-1 text-2xl font-semibold">Mimo</div>
            </div>
            <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-primary">
              <IconGauge className="size-5" />
            </div>
          </div>

          <div className="divide-y divide-border">
            {capabilities.map((item) => {
              const Icon = item.icon

              return (
                <div key={item.title} className="flex gap-3 py-4">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium">{item.title}</div>
                    <div className="mt-1 text-sm leading-6 text-muted-foreground">
                      {item.text}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-2 rounded-lg border border-border bg-background px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">当前状态</span>
              <span className="text-sm font-medium">
                {user ? user.name : "未登录"}
              </span>
            </div>
          </div>
        </aside>
      </section>
    </main>
  )
}
