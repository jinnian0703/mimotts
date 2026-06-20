"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

import { api } from "@/lib/api"
import {
  clearSession,
  getStoredInstallStatus,
  getStoredUser,
  onSessionChange,
  setSession,
  setStoredInstallStatus,
} from "@/lib/session"
import type { InstallStatus, User } from "@/lib/types"
import { AppLoading } from "@/components/app-loading"

const publicRoutes = new Set(["/", "/install", "/login"])
const adminRoutes = new Set(["/users", "/system-settings", "/announcements"])

function normalizePathname(pathname: string) {
  return pathname === "/" ? pathname : pathname.replace(/\/+$/, "")
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true

    async function resolveAccess() {
      const currentPath = normalizePathname(pathname)
      const storedInstall = getStoredInstallStatus()
      let installStatus: InstallStatus =
        storedInstall ?? { installed: true, administratorBound: true }

      try {
        installStatus = await api.installStatus()
        setStoredInstallStatus(installStatus)
      } catch {
        if (!storedInstall) {
          installStatus = { installed: true, administratorBound: true }
        }
      }

      if (!installStatus.installed || !installStatus.administratorBound) {
        if (currentPath !== "/install") {
          router.replace("/install")
          return
        }
      }

      const isPublic = publicRoutes.has(currentPath)
      let authenticated = false

      if (!isPublic) {
        try {
          const user = await api.me()
          setSession(user)
          authenticated = true
        } catch {
          clearSession()
        }
      }

      if (!authenticated && !isPublic) {
        router.replace("/login")
        return
      }

      if (authenticated && adminRoutes.has(currentPath)) {
        const user = getStoredUser()
        if (user?.role !== "admin") {
          router.replace("/dashboard")
          return
        }
      }

      if (mounted) {
        setReady(true)
      }
    }

    resolveAccess()

    return () => {
      mounted = false
    }
  }, [pathname, router])

  if (!ready) {
    return <AppLoading />
  }

  return children
}

export function useCurrentUser() {
  const [user, setUser] = useState<User | null>(() => getStoredUser())

  useEffect(() => {
    const syncStoredUser = () => {
      setUser(getStoredUser())
    }

    const unsubscribe = onSessionChange(syncStoredUser)
    syncStoredUser()

    return unsubscribe
  }, [])

  return user
}
