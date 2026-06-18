"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  IconAdjustments,
  IconBellRinging,
  IconBrandGithub,
  IconChevronsLeft,
  IconChevronsRight,
  IconClipboardList,
  IconCreditCard,
  IconDashboard,
  IconLogout,
  IconMenu2,
  IconMicrophone,
  IconShieldLock,
  IconUsers,
  IconX,
} from "@tabler/icons-react"

import { AnnouncementStack } from "@/components/announcement-stack"
import { useCurrentUser } from "@/components/auth-gate"
import { ThemeToggle } from "@/components/theme-toggle"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { api } from "@/lib/api"
import { clearSession } from "@/lib/session"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/dashboard", label: "仪表盘", icon: IconDashboard },
  { href: "/workbench", label: "工作台", icon: IconMicrophone },
  { href: "/billing", label: "套餐计费", icon: IconCreditCard },
  { href: "/settings", label: "设置", icon: IconAdjustments },
]

const adminNavItems = [
  { href: "/tasks", label: "任务管理", icon: IconClipboardList },
  { href: "/users", label: "用户管理", icon: IconUsers },
  { href: "/announcements", label: "公告管理", icon: IconBellRinging },
  { href: "/system-settings", label: "系统设置", icon: IconShieldLock },
]

const repositoryUrl = "https://github.com/jinnian0703/mimotts"

function normalizePathname(pathname: string) {
  return pathname === "/" ? pathname : pathname.replace(/\/+$/, "")
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const user = useCurrentUser()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(false)
  const [brand, setBrand] = useState({ name: "MimoTTS", iconUrl: "" })
  const currentPath = normalizePathname(pathname)
  const isPublic =
    currentPath === "/" || currentPath === "/login" || currentPath === "/install"

  useEffect(() => {
    if (isPublic) {
      return
    }

    let cancelled = false

    api
      .basicInfo()
      .then((config) => {
        if (cancelled) {
          return
        }

        setBrand({
          name: config.system_name || config.site_title || "MimoTTS",
          iconUrl: config.icon_url ?? config.iconUrl ?? "",
        })
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [isPublic])

  async function handleLogout() {
    await api.logout().catch(() => undefined)
    clearSession()
    router.replace("/login")
  }

  if (isPublic) {
    return <>{children}</>
  }

  const initials = user?.name.slice(0, 2).toUpperCase() ?? "MI"
  const nav = user?.role === "admin" ? [...navItems, ...adminNavItems] : navItems
  const sidebarOffset = desktopNavCollapsed ? "lg:pl-20" : "lg:pl-64"

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 hidden flex-col border-r bg-sidebar px-4 py-5 transition-[width] duration-200 lg:flex",
          desktopNavCollapsed ? "w-20 px-3" : "w-64"
        )}
      >
        <div
          className={cn(
            "flex items-start gap-2",
            desktopNavCollapsed && "flex-col items-center"
          )}
        >
          <Link
            href="/dashboard"
            className={cn(
              "flex min-w-0 items-center gap-3",
              desktopNavCollapsed && "justify-center"
            )}
            aria-label="MimoTTS"
          >
            <BrandIcon iconUrl={brand.iconUrl} />
            {!desktopNavCollapsed && (
              <div className="min-w-0">
                <span className="font-heading text-lg font-semibold">
                  {brand.name}
                </span>
              </div>
            )}
          </Link>

          <div
            className={cn(
              "flex items-center gap-1",
              desktopNavCollapsed ? "flex-col" : "ml-auto"
            )}
          >
            <ThemeToggle
              compact
              tooltip={!desktopNavCollapsed}
              className={desktopNavCollapsed ? "size-8" : undefined}
              iconClassName={desktopNavCollapsed ? "size-5" : undefined}
            />
            {desktopNavCollapsed ? (
              <Button
                asChild
                variant="outline"
                size="icon"
                className="size-8"
                aria-label="打开 GitHub 仓库"
              >
                <a
                  href={repositoryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <IconBrandGithub className="size-4" />
                </a>
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    asChild
                    variant="outline"
                    size="icon-xs"
                    aria-label="打开 GitHub 仓库"
                  >
                    <a
                      href={repositoryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <IconBrandGithub />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">GitHub 仓库</TooltipContent>
              </Tooltip>
            )}
            {desktopNavCollapsed ? (
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => setDesktopNavCollapsed(false)}
                aria-label="展开侧边栏"
              >
                <IconChevronsRight className="size-4" />
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-xs"
                    onClick={() => setDesktopNavCollapsed(true)}
                    aria-label="收起侧边栏"
                  >
                    <IconChevronsLeft />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">收起侧边栏</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        <nav className={cn("flex flex-col gap-1", desktopNavCollapsed ? "mt-6" : "mt-8")}>
          {nav.map((item) => {
            const Icon = item.icon
            const active = currentPath === item.href

            if (desktopNavCollapsed) {
              return (
                <Button
                  key={item.href}
                  asChild
                  variant={active ? "secondary" : "ghost"}
                  size="icon"
                  className={cn("mx-auto size-10", active && "font-medium")}
                >
                  <Link href={item.href} aria-label={item.label}>
                    <Icon className="size-5" />
                  </Link>
                </Button>
              )
            }

            return (
              <Button
                key={item.href}
                asChild
                variant={active ? "secondary" : "ghost"}
                className={cn("justify-start", active && "font-medium")}
              >
                <Link href={item.href}>
                  <Icon data-icon="inline-start" />
                  {item.label}
                </Link>
              </Button>
            )
          })}
        </nav>

        <div className={cn("mt-auto flex flex-col gap-4", desktopNavCollapsed && "items-center")}>
          <Separator />
          {!desktopNavCollapsed ? (
            <>
              <div className="flex items-center gap-3 px-2">
                <Avatar className="size-9">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{user?.name ?? "未加载"}</div>
                  <div className="text-xs text-muted-foreground">
                    {user?.role === "admin" ? "管理员" : "用户"}
                  </div>
                </div>
                {user?.role === "admin" && <Badge variant="secondary">Admin</Badge>}
              </div>
              <Button variant="outline" onClick={handleLogout}>
                <IconLogout data-icon="inline-start" />
                退出
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="icon"
              className="size-9"
              onClick={handleLogout}
              aria-label="退出"
            >
              <IconLogout className="size-4" />
            </Button>
          )}
        </div>
      </aside>

      <header className="sticky top-0 z-40 border-b bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/dashboard"
            className="font-heading text-lg font-semibold"
            onClick={() => setMobileNavOpen(false)}
          >
            {brand.name}
          </Link>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-label={mobileNavOpen ? "关闭导航" : "打开导航"}
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-app-nav"
          >
            {mobileNavOpen ? <IconX /> : <IconMenu2 />}
          </Button>
        </div>
      </header>

      <div
        className={cn(
          "fixed inset-0 z-50 overflow-hidden lg:hidden",
          mobileNavOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!mobileNavOpen}
      >
        <button
          type="button"
          className={cn(
            "absolute inset-0 bg-foreground/30 transition-opacity duration-200",
            mobileNavOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setMobileNavOpen(false)}
          aria-label="关闭导航遮罩"
        />
        <aside
          id="mobile-app-nav"
          className={cn(
            "absolute inset-y-0 left-0 flex max-h-dvh w-[min(20rem,86vw)] flex-col overflow-hidden border-r bg-sidebar px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-200 ease-out",
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex items-center justify-between gap-3 px-2">
            <div className="flex items-center gap-3">
              <BrandIcon iconUrl={brand.iconUrl} />
              <div className="flex flex-col">
                <span className="font-heading text-lg font-semibold">
                  {brand.name}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle compact />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    asChild
                    variant="ghost"
                    size="icon-sm"
                    aria-label="打开 GitHub 仓库"
                  >
                    <a
                      href={repositoryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <IconBrandGithub />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">GitHub 仓库</TooltipContent>
              </Tooltip>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setMobileNavOpen(false)}
                aria-label="关闭导航"
              >
                <IconX />
              </Button>
            </div>
          </div>

          <nav className="mt-8 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain pr-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = currentPath === item.href

              return (
                <Button
                  key={item.href}
                  asChild
                  variant={active ? "secondary" : "ghost"}
                  className={cn("justify-start", active && "font-medium")}
                >
                  <Link href={item.href} onClick={() => setMobileNavOpen(false)}>
                    <Icon data-icon="inline-start" />
                    {item.label}
                  </Link>
                </Button>
              )
            })}

            {user?.role === "admin" &&
              adminNavItems.map((item) => {
                const Icon = item.icon
                const active = currentPath === item.href

                return (
                  <Button
                    key={item.href}
                    asChild
                    variant={active ? "secondary" : "ghost"}
                    className={cn("justify-start", active && "font-medium")}
                  >
                    <Link href={item.href} onClick={() => setMobileNavOpen(false)}>
                      <Icon data-icon="inline-start" />
                      {item.label}
                    </Link>
                  </Button>
                )
              })}
          </nav>

        </aside>
      </div>

      <main className={cn("min-h-dvh transition-[padding] duration-200", sidebarOffset)}>
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <AnnouncementStack />
          {children}
        </div>
      </main>
    </div>
  )
}

function BrandIcon({ iconUrl }: { iconUrl?: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const canRenderImage = Boolean(iconUrl) && failedUrl !== iconUrl

  return (
    <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary text-primary-foreground">
      {canRenderImage && iconUrl ? (
        <Image
          src={iconUrl}
          alt=""
          width={36}
          height={36}
          unoptimized
          className="size-full object-cover"
          onError={() => setFailedUrl(iconUrl)}
        />
      ) : (
        <IconClipboardList className="size-5" />
      )}
    </div>
  )
}
