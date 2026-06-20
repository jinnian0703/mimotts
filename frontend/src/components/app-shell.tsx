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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { api } from "@/lib/api"
import { clearSession } from "@/lib/session"
import {
  defaultSiteBrand,
  fallbackSiteIconUrl,
  normalizeSiteBrand,
  readCachedSiteBrand,
  resolveSiteIconUrl,
  writeCachedSiteBrand,
} from "@/lib/site-brand"
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

function getInitialBrandState() {
  const cachedBrand = readCachedSiteBrand()

  return {
    brand: cachedBrand ?? defaultSiteBrand,
    loaded: true,
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const user = useCurrentUser()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(false)
  const [{ brand, loaded: brandLoaded }, setBrandState] = useState(getInitialBrandState)
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

        const nextBrand = normalizeSiteBrand(config)
        setBrandState({ brand: nextBrand, loaded: true })
        writeCachedSiteBrand(nextBrand)
      })
      .catch(() => {
        if (!cancelled) {
          setBrandState((current) =>
            current.loaded ? current : { ...current, loaded: true }
          )
        }
      })

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
  const sidebarOffset = desktopNavCollapsed ? "lg:pl-24" : "lg:pl-80"

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 hidden flex-col border-r bg-sidebar px-5 py-6 transition-[width] duration-200 lg:flex",
          desktopNavCollapsed ? "w-24 px-4" : "w-80"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 overflow-visible",
            desktopNavCollapsed && "flex-col items-center"
          )}
        >
          <Link
            href="/dashboard"
            className={cn(
              "flex shrink-0 items-center gap-3",
              desktopNavCollapsed && "justify-center"
            )}
            aria-label="MimoTTS"
          >
            <BrandIcon iconUrl={brand.iconUrl} loaded={brandLoaded} />
            {!desktopNavCollapsed && (
              <div className="shrink-0">
                <span className="block whitespace-nowrap font-heading text-xl font-semibold">
                  {brand.name}
                </span>
              </div>
            )}
          </Link>

          <div
            className={cn(
              "flex shrink-0 items-center gap-1",
              desktopNavCollapsed && "flex-col"
            )}
          >
            <ThemeToggle
              compact
              tooltip={false}
              className={desktopNavCollapsed ? "size-9" : "size-8"}
              iconClassName={desktopNavCollapsed ? "size-5" : undefined}
            />
            {desktopNavCollapsed ? (
              <Button
                asChild
                variant="outline"
                size="icon"
                className="size-9"
                aria-label="打开 GitHub 仓库"
              >
                <a
                  href={repositoryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <IconBrandGithub className="size-5" />
                </a>
              </Button>
            ) : (
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
            )}
            {desktopNavCollapsed ? (
              <Button
                variant="outline"
                size="icon"
                className="size-9"
                onClick={() => setDesktopNavCollapsed(false)}
                aria-label="展开侧边栏"
              >
                <IconChevronsRight className="size-5" />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => setDesktopNavCollapsed(true)}
                aria-label="收起侧边栏"
              >
                <IconChevronsLeft className="size-4" />
              </Button>
            )}
          </div>
        </div>

        <nav className={cn("flex flex-col gap-2", desktopNavCollapsed ? "mt-7" : "mt-10")}>
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
                  className={cn("mx-auto size-11", active && "font-medium")}
                >
                  <Link href={item.href} aria-label={item.label}>
                    <Icon className="size-[22px]" />
                  </Link>
                </Button>
              )
            }

            return (
              <Button
                key={item.href}
                asChild
                variant={active ? "secondary" : "ghost"}
                className={cn("h-10 justify-start gap-3 px-3 text-[15px]", active && "font-medium")}
              >
                <Link href={item.href}>
                  <Icon data-icon="inline-start" className="size-5" />
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
                <Avatar className="size-11">
                  {user?.avatarUrl && (
                    <AvatarImage src={user.avatarUrl} alt={user.name} />
                  )}
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-medium">{user?.name ?? "未加载"}</div>
                  <div className="text-sm text-muted-foreground">
                    {user?.role === "admin" ? "管理员" : "用户"}
                  </div>
                </div>
                {user?.role === "admin" && <Badge variant="secondary">Admin</Badge>}
              </div>
              <Button variant="outline" className="h-10 text-[15px]" onClick={handleLogout}>
                <IconLogout data-icon="inline-start" className="size-5" />
                退出
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="icon"
              className="size-10"
              onClick={handleLogout}
              aria-label="退出"
            >
              <IconLogout className="size-5" />
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
            "absolute inset-y-0 left-0 flex max-h-dvh w-[min(22rem,88vw)] flex-col overflow-hidden border-r bg-sidebar px-5 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-200 ease-out",
            mobileNavOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex items-center justify-between gap-3 px-2">
            <div className="flex items-center gap-3">
              <BrandIcon iconUrl={brand.iconUrl} loaded={brandLoaded} />
              <div className="flex flex-col">
                <span className="font-heading text-xl font-semibold">
                  {brand.name}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle compact tooltip={false} />
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

          <nav className="mt-10 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = currentPath === item.href

              return (
                <Button
                  key={item.href}
                  asChild
                  variant={active ? "secondary" : "ghost"}
                  className={cn("h-10 justify-start gap-3 px-3 text-[15px]", active && "font-medium")}
                >
                  <Link href={item.href} onClick={() => setMobileNavOpen(false)}>
                    <Icon data-icon="inline-start" className="size-5" />
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
                    className={cn("h-10 justify-start gap-3 px-3 text-[15px]", active && "font-medium")}
                  >
                    <Link href={item.href} onClick={() => setMobileNavOpen(false)}>
                      <Icon data-icon="inline-start" className="size-5" />
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

function resolveBrandImageUrl({
  loaded,
  iconUrl,
  failedUrls,
}: {
  loaded?: boolean
  iconUrl?: string | null
  failedUrls: string[]
}) {
  if (!loaded) {
    return ""
  }

  const primaryIconUrl = resolveSiteIconUrl(iconUrl)

  if (!failedUrls.includes(primaryIconUrl)) {
    return primaryIconUrl
  }

  if (primaryIconUrl !== fallbackSiteIconUrl && !failedUrls.includes(fallbackSiteIconUrl)) {
    return fallbackSiteIconUrl
  }

  return ""
}

function BrandIcon({
  iconUrl,
  loaded,
}: {
  iconUrl?: string | null
  loaded?: boolean
}) {
  const [failedUrls, setFailedUrls] = useState<string[]>([])
  const imageUrl = resolveBrandImageUrl({ loaded, iconUrl, failedUrls })

  return (
    <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          width={44}
          height={44}
          priority
          unoptimized
          className="max-h-11 max-w-11 object-contain"
          onError={() =>
            setFailedUrls((current) =>
              current.includes(imageUrl) ? current : [...current, imageUrl]
            )
          }
        />
      ) : (
        <span className={cn("block size-8 rounded-md", loaded && "bg-muted")} />
      )}
    </div>
  )
}
